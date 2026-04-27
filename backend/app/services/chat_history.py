import logging
import re as _re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

from app.db.mongodb import get_database

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Search normalisation helpers
# ---------------------------------------------------------------------------

# Map from a diacritic-free ASCII letter to a regex character class that
# matches both the plain letter and its most common accented variants.
_DIACRITIC_CLASSES: dict[str, str] = {
    "a": "[aáàãâäåÀÁÂÃÄ]",
    "e": "[eéèêëÈÉÊË]",
    "i": "[iíìîïÌÍÎÏ]",
    "o": "[oóòõôöÒÓÔÕÖ]",
    "u": "[uúùûüÙÚÛÜ]",
    "c": "[cçÇ]",
    "n": "[nñÑ]",
}

_TITLE_MAX_LENGTH = 80


def _strip_diacritics(text: str) -> str:
    """Return *text* with all combining diacritical marks removed."""
    return "".join(
        c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn"
    )


def _normalize_query(query: str) -> str:
    """
    Produce a search-friendly version of *query*:
    - Lowercase
    - Strip diacritics (so “algorítmo” → “algoritmo”)
    - Remove characters that are not word characters or whitespace
    - Collapse extra whitespace
    """
    stripped = _strip_diacritics(query.lower())
    cleaned = _re.sub(r"[^\w\s]", " ", stripped)
    return " ".join(cleaned.split())


def _build_content_regex(normalized_term: str) -> str:
    """
    Build a regex pattern from a *normalized_term* (no diacritics, lowercase)
    that will match the term inside stored content even when the stored text
    uses accented characters.

    Example: “economia” → “[eéèêë][cç][oóòõôö]nomia”
    """
    pattern_parts: list[str] = []
    for char in normalized_term:
        if char in _DIACRITIC_CLASSES:
            pattern_parts.append(_DIACRITIC_CLASSES[char])
        elif char == " ":
            pattern_parts.append(r"\s+")
        elif char.isalnum():
            pattern_parts.append(_re.escape(char))
        else:
            pattern_parts.append(_re.escape(char))
    return "".join(pattern_parts)


def _build_provisional_title(content: str) -> str:
    """
    Derive a deterministic, user-facing title directly from the first message.

    This avoids the sidebar staying in a perpetual loading state while the
    asynchronous metadata job generates a better 3-5 word title later.
    """
    text = " ".join((content or "").strip().split())
    if not text:
        return "Nova conversa"

    if len(text) <= _TITLE_MAX_LENGTH:
        return text

    clipped = text[: _TITLE_MAX_LENGTH - 3].rstrip(" ,:;.-")
    return f"{clipped}..."


class ChatHistoryService:
    def __init__(self):
        self.collection_name = "chat_history"

    @staticmethod
    def build_provisional_title(content: str) -> str:
        return _build_provisional_title(content)

    async def ensure_indexes(self) -> None:
        """
        Creates indexes for fast per-user listing and unique thread ownership.
        Also creates a compound index to speed up paginated message fetches.
        Adds a full-text index on the embedded messages content for search.
        Idempotent and safe to call at startup.
        """
        db = get_database()
        collection = db[self.collection_name]
        await collection.create_index(
            [("thread_id", ASCENDING)], unique=True, name="uq_chat_thread_id"
        )
        await collection.create_index(
            [("user_id", ASCENDING), ("updated_at", DESCENDING)],
            name="idx_chat_user_updated",
        )
        # Compound index to optimise paginated message queries on a specific thread.
        await collection.create_index(
            [("thread_id", ASCENDING), ("user_id", ASCENDING)],
            name="idx_chat_thread_user",
        )
        # Full-text index on embedded message content.
        # NOTE: We use a pure $regex pipeline for search (no $text operator)
        # so this index is informational / reserved for future use.
        # Keeping it ensures no schema surprises; it's lightweight and safe.

    async def create_thread_if_not_exists(
        self, thread_id: str, user_id: str, title: str | None = None
    ) -> None:
        """
        Ensures a document exists for the thread. If it doesn't, creates one with
        an empty messages list and creation timestamp.
        """
        try:
            db = get_database()
            collection = db[self.collection_name]

            existing = await collection.find_one({"thread_id": thread_id})
            if existing:
                if existing.get("user_id") != user_id:
                    raise PermissionError(
                        "Thread does not belong to the authenticated user."
                    )
                return

            if not existing:
                now = datetime.now(timezone.utc)
                doc = {
                    "thread_id": thread_id,
                    "user_id": user_id,
                    "title": title or "Nova conversa",
                    "created_at": now,
                    "updated_at": now,
                    "messages": [],
                    # Initialize root-level token counter on thread creation.
                    # $inc will create subdocument fields automatically for existing
                    # threads, but new threads must be bootstrapped here.
                    "token_usage": {
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "total_tokens": 0,
                    },
                }
                try:
                    await collection.insert_one(doc)
                except DuplicateKeyError:
                    # Another request created this thread concurrently; treat as success.
                    pass
                logger.info(f"Created new chat thread in MongoDB: {thread_id}")

        except Exception as e:
            logger.error(
                f"MongoDB ChatHistoryService Error (create_thread): {e}", exc_info=True
            )
            raise

    async def log_message(
        self,
        thread_id: str,
        user_id: str,
        role: str,
        content: str,
        metadata: Dict[str, Any] | None = None,
    ) -> None:
        """
        Appends a message (human or ai) to the thread's messages array.
        """
        try:
            db = get_database()
            collection = db[self.collection_name]
            now = datetime.now(timezone.utc)

            message_entry = {
                "role": role,
                "content": content,
                "timestamp": now,
                "metadata": metadata or {},
            }

            update_query = {
                "$push": {"messages": message_entry},
                "$set": {"updated_at": now},
                # NOTE: token_usage is NOT initialized here via $setOnInsert because
                # MongoDB does not allow $setOnInsert (sets a whole subdocument) and
                # $inc (increments subdocument dot-paths) to touch the same root key in
                # one atomic operation — it raises a conflict error. Token counters are
                # initialized in create_thread_if_not_exists() and $inc auto-creates the
                # fields if somehow missing (e.g. pre-existing threads).
                "$setOnInsert": {
                    "thread_id": thread_id,
                    "user_id": user_id,
                    "created_at": now,
                    "title": self._title_from_first_message(content)
                    if role == "human"
                    else "Nova conversa",
                },
            }

            # Optional: Dual Persistence strategy for Tokens
            if metadata and "token_usage" in metadata:
                tokens = metadata["token_usage"]
                prompt_tokens = tokens.get("prompt_tokens", 0)
                completion_tokens = tokens.get("completion_tokens", 0)
                total_tokens = tokens.get("total_tokens", 0)
                
                # Use $inc to atomically update the root-level counters
                update_query["$inc"] = {
                    "token_usage.prompt_tokens": prompt_tokens,
                    "token_usage.completion_tokens": completion_tokens,
                    "token_usage.total_tokens": total_tokens,
                }

            await collection.update_one(
                {"thread_id": thread_id, "user_id": user_id},
                update_query,
                upsert=True,
            )

            if role == "human":
                await collection.update_one(
                    {
                        "thread_id": thread_id,
                        "user_id": user_id,
                        "$or": [
                            {"title": {"$exists": False}},
                            {"title": ""},
                            {"title": "Nova conversa"},
                        ],
                    },
                    {"$set": {"title": self._title_from_first_message(content)}},
                )

            logger.info(f"Appended {role} message to thread {thread_id} in MongoDB")
        except Exception as e:
            logger.error(
                f"MongoDB ChatHistoryService Error (log_message): {e}", exc_info=True
            )
            raise

    async def user_has_access(self, thread_id: str, user_id: str) -> bool:
        db = get_database()
        collection = db[self.collection_name]
        existing = await collection.find_one(
            {"thread_id": thread_id}, {"_id": 0, "user_id": 1}
        )
        if not existing:
            return False
        return existing.get("user_id") == user_id

    async def update_thread_title(self, thread_id: str, title: str) -> bool:
        """
        Updates the title of a specific thread.
        """
        db = get_database()
        collection = db[self.collection_name]
        try:
            result = await collection.update_one(
                {"thread_id": thread_id},
                {"$set": {"title": title, "updated_at": datetime.now(timezone.utc)}},
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(
                f"MongoDB ChatHistoryService Error (update_thread_title): {e}",
                exc_info=True,
            )
            return False

    async def update_thread_metadata(self, thread_id: str, title: str, ui_summary: Optional[str] = None) -> bool:
        """
        Updates the title and optionally the ui_summary of a specific thread.
        """
        db = get_database()
        collection = db[self.collection_name]
        try:
            update_fields = {"title": title, "updated_at": datetime.now(timezone.utc)}
            if ui_summary is not None:
                update_fields["ui_summary"] = ui_summary
                
            result = await collection.update_one(
                {"thread_id": thread_id},
                {"$set": update_fields},
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(
                f"MongoDB ChatHistoryService Error (update_thread_metadata): {e}",
                exc_info=True,
            )
            return False

    async def get_thread(self, thread_id: str, user_id: str) -> Dict[str, Any] | None:
        db = get_database()
        collection = db[self.collection_name]
        return await collection.find_one(
            {"thread_id": thread_id, "user_id": user_id}, {"_id": 0}
        )

    async def get_thread_messages_paginated(
        self,
        thread_id: str,
        user_id: str,
        limit: int = 20,
        skip: int = 0,
    ) -> Optional[Dict[str, Any]]:
        """
        Returns a page of messages for a given thread, ordered oldest-to-newest
        within the page, fetched from the tail of the messages array (most recent).

        Strategy (all executed inside MongoDB):
          1. $match   – filter by thread_id + user_id.
          2. $addFields – compute totalMessages = $size of messages array.
          3. $addFields – extract the correct slice:
               slice_start = max(totalMessages - skip - limit, 0)
               slice_end   = totalMessages - skip  (exclusive)
               The slice covers indices [slice_start, slice_end).
          4. $project  – expose only the fields the endpoint needs.
        """
        db = get_database()
        collection = db[self.collection_name]

        pipeline = [
            {"$match": {"thread_id": thread_id, "user_id": user_id}},
            # Step 1: count total messages
            {
                "$addFields": {
                    "totalMessages": {"$size": "$messages"},
                }
            },
            # Step 2: derive the window boundaries
            {
                "$addFields": {
                    "_sliceEnd": {"$subtract": ["$totalMessages", skip]},
                    "_sliceStart": {
                        "$max": [
                            {"$subtract": ["$totalMessages", skip + limit]},
                            0,
                        ]
                    },
                }
            },
            # Step 3: project only the page window
            {
                "$project": {
                    "_id": 0,
                    "thread_id": 1,
                    "title": 1,
                    "created_at": 1,
                    "updated_at": 1,
                    "totalMessages": 1,
                    "_sliceStart": 1,
                    "messages": {
                        "$slice": [
                            "$messages",
                            "$_sliceStart",
                            {"$subtract": ["$_sliceEnd", "$_sliceStart"]},
                        ]
                    },
                }
            },
        ]

        results = await collection.aggregate(pipeline).to_list(length=1)
        if not results:
            return None

        doc = results[0]
        total = doc.get("totalMessages", 0)
        return {
            "thread_id": doc.get("thread_id"),
            "title": doc.get("title"),
            "created_at": doc.get("created_at"),
            "updated_at": doc.get("updated_at"),
            "messages": doc.get("messages", []),
            "totalMessages": total,
            "hasMore": (skip + limit) < total,
            "sliceStart": doc.get("_sliceStart", 0),
        }

    async def list_threads(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        db = get_database()
        collection = db[self.collection_name]
        cursor = (
            collection.find({"user_id": user_id}, {"_id": 0})
            .sort("updated_at", DESCENDING)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    async def delete_thread(self, thread_id: str, user_id: str) -> bool:
        db = get_database()
        collection = db[self.collection_name]

        # 1. Delete from MongoDB (chat document and embedded messages)
        result = await collection.delete_one(
            {"thread_id": thread_id, "user_id": user_id}
        )

        if result.deleted_count > 0:
            # 2. Delete from Redis (LangGraph checkpoints)
            try:
                from app.db.redis_checkpoint import delete_checkpoint

                await delete_checkpoint(thread_id)
            except Exception as e:
                logger.error(
                    f"Failed to delete Redis checkpoints for thread {thread_id}: {e}"
                )
                # We don't fail the whole request if Redis cleanup fails,
                # but we log it as it leaves orphan data.

            return True
        return False

    async def search_messages(
        self,
        user_id: str,
        query: str,
        limit: int = 10,
        skip: int = 0,
    ) -> Dict[str, Any]:
        """
        Regex-based search across all message contents for a given user.

        Strategy (no $text — enables prefix / partial matching):
          1. $match   — filter by user_id only (fast index hit).
          2. $unwind  — explode messages array, tracking position.
          3. $match   — diacritic-aware regex on message content
                        (case-insensitive, prefix/substring).
          4. $group   — one result per thread; count matching messages
                        for a simple relevance score.
          5. $sort    — by match_count desc, then most-recent first.
          6. $facet   — data page + total count in one round-trip.
        """
        db = get_database()
        collection = db[self.collection_name]

        # Normalise: lowercase, strip diacritics, remove special chars.
        norm_query = _normalize_query(query)
        if not norm_query:
            return {"results": [], "total": 0, "has_more": False}

        # Regex that expands each letter to include its accentuated variants,
        # allowing "fran" to match "francês", "e" to match "é"/"ê", etc.
        content_regex = _build_content_regex(norm_query)

        pipeline: list = [
            # Step 1: restrict to user (fast, uses idx_chat_user_updated)
            {"$match": {"user_id": user_id}},
            # Step 1.5: capture total message count before unwind
            {"$addFields": {"_temp_size": {"$size": "$messages"}}},
            # Step 2: one row per message, index tracked
            {"$unwind": {"path": "$messages", "includeArrayIndex": "_msg_index"}},
            # Step 3: diacritic-aware, case-insensitive regex filter
            {
                "$match": {
                    "messages.content": {
                        "$regex": content_regex,
                        "$options": "i",
                    }
                }
            },
            # Step 4: collapse to one result per thread
            {
                "$group": {
                    "_id": "$thread_id",
                    "thread_id": {"$first": "$thread_id"},
                    "title": {"$first": "$title"},
                    "updated_at": {"$first": "$updated_at"},
                    "matched_content": {"$first": "$messages.content"},
                    "message_index": {"$first": {"$toLong": "$_msg_index"}},
                    "thread_total": {"$first": "$_temp_size"},
                    "match_count": {"$sum": 1},
                }
            },
            # Step 5: threads with more matches first, then most recent
            {"$sort": {"match_count": -1, "updated_at": -1}},
            # Step 6: paginate + total in a single pass
            {
                "$facet": {
                    "data": [{"$skip": skip}, {"$limit": limit}],
                    "total_count": [{"$count": "n"}],
                }
            },
        ]

        results = await collection.aggregate(pipeline).to_list(length=1)
        if not results:
            return {"results": [], "total": 0, "has_more": False}

        facet = results[0]
        data = facet.get("data", [])
        total = facet["total_count"][0]["n"] if facet.get("total_count") else 0

        def make_snippet(content: str, norm_q: str, ctx: int = 60) -> str:
            """
            Extract a context window around the first occurrence of *norm_q*
            inside *content*, comparing in a normalised (no-diacritic,
            lowercase) space so the window is located even when the stored
            text has accented characters.
            """
            norm_content = _strip_diacritics(content.lower())
            idx = norm_content.find(norm_q)
            if idx == -1:
                return content[:120]
            start = max(0, idx - ctx)
            end = min(len(content), idx + len(norm_q) + ctx)
            prefix = "..." if start > 0 else ""
            suffix = "..." if end < len(content) else ""
            return f"{prefix}{content[start:end]}{suffix}"

        items = [
            {
                "thread_id": doc["thread_id"],
                "title": doc["title"],
                "score": float(doc.get("match_count", 1)),
                "matched_content": make_snippet(doc["matched_content"], norm_query),
                "message_index": doc["message_index"],
                "thread_total": doc.get("thread_total", 0),
            }
            for doc in data
        ]

        return {
            "results": items,
            "total": total,
            "has_more": (skip + limit) < total,
        }

    @staticmethod
    def _title_from_first_message(content: str) -> str:
        return _build_provisional_title(content)


chat_history_service = ChatHistoryService()
