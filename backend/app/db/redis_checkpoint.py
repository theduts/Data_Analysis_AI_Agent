import base64
import json
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from langgraph.checkpoint.redis.aio import AsyncRedisSaver  # pyright: ignore[reportMissingImports]
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

import logging
from app.core.config import settings

logger = logging.getLogger(__name__)


def _build_redis_url() -> str:
    """Builds the Redis URL from settings for the checkpointer."""
    if settings.REDIS_PASSWORD:
        return f"redis://:{settings.REDIS_PASSWORD}@{settings.REDIS_HOST}:{settings.REDIS_PORT}/{settings.REDIS_CHECKPOINT_DB}"
    return f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/{settings.REDIS_CHECKPOINT_DB}"


class Base64JsonSerializer(JsonPlusSerializer):
    def dumps(self, obj):
        # _dump_metadata calls this and then strictly calls .decode("utf-8") on the result.
        # Furthermore, aget_tuple natively calls json.loads() ignoring custom load handlers.
        # This means metadata *MUST* purely be a JSON serialized dictionary.
        return json.dumps(obj).encode("utf-8")

    def loads(self, data):
        if isinstance(data, bytes):
            data = data.decode("utf-8")
        return json.loads(data)

    def dumps_typed(self, obj):  # pyright: ignore[reportIncompatibleMethodOverride]
        # 1. The Checkpoint root payload
        # This prevents channel_values from being saved inside the main document.
        # It MUST return string or bytes (we return string)
        if isinstance(obj, dict) and "v" in obj and "channel_values" in obj:
            obj_copy = obj.copy()
            obj_copy.pop("channel_values", None)
            obj_copy.pop("pending_sends", None)
            return "json", json.dumps(obj_copy)

        t, b = super().dumps_typed(obj)

        # 2. Checkpoint Metadata
        # _dump_metadata natively calls .decode() on the passed blob so it MUST be bytes.
        if isinstance(obj, dict) and "source" in obj and "step" in obj:
            return t, b

        # 3. Standard JSON Dict overrides
        # Redis JSON client WILL crash if bytes are passed into payload inserts.
        if t == "json" and isinstance(b, bytes):
            return t, b.decode("utf-8")

        # 4. MessagePack Binary values
        # They MUST be base64-encoded to string otherwise the Redis payload crashes on arbitrary bytes.
        if isinstance(b, bytes):
            b64 = base64.b64encode(b).decode("utf-8")
            return t, b64

        return t, b

    def loads_typed(self, data):
        t, d_str = data
        if t == "json":
            if isinstance(d_str, str):
                d_str = d_str.encode("utf-8")
            return super().loads_typed((t, d_str))

        if isinstance(d_str, str):
            try:
                b = base64.b64decode(d_str)
            except Exception:
                b = d_str
        else:
            b = d_str
        return super().loads_typed((t, b))


@asynccontextmanager
async def get_redis_checkpointer() -> AsyncGenerator[AsyncRedisSaver, None]:
    """
    Context manager that yields an AsyncRedisSaver instance connected via URL.
    Usage:
        async with get_redis_checkpointer() as checkpointer:
            graph = builder.compile(checkpointer=checkpointer)
            await graph.ainvoke(...)
    """
    async with AsyncRedisSaver.from_conn_string(_build_redis_url()) as saver:
        saver.serde = Base64JsonSerializer()
        yield saver


async def delete_checkpoint(thread_id: str) -> None:
    """
    Deletes all checkpoint data in Redis for a specific thread_id.
    Connects directly to Redis to perform pattern-based deletion.
    """
    import redis.asyncio as aioredis

    url = _build_redis_url()
    async with aioredis.from_url(url) as client:
        # LangGraph Redis keys pattern: checkpoint:<thread_id>:...
        # Also includes checkpoint_writes:<thread_id>:...
        patterns = [
            f"checkpoint:{thread_id}:*",
            f"checkpoint_writes:{thread_id}:*",
        ]

        total_deleted = 0
        for pattern in patterns:
            keys = await client.keys(pattern)
            if keys:
                deleted = await client.delete(*keys)
                total_deleted += deleted

        if total_deleted > 0:
            logger.info(
                f"Deleted {total_deleted} Redis checkpoint keys/writes for thread {thread_id}"
            )
        else:
            logger.info(f"No Redis checkpoint keys/writes found for thread {thread_id}")
