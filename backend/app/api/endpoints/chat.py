"""
FastAPI endpoint: /chat

Receives a user message, invokes the LangGraph orchestrator, and streams or
returns the final response. Each conversation is identified by a `thread_id`.

Endpoints:
  POST /chat/message  — Send a message and receive the final formatted response
  POST /chat/resume   — Resume a graph interrupted for human validation
"""

import logging
import uuid
import re
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Response,
    status,
)
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field

from app.api import deps
from app.graph.graph_definition import create_compiled_graph
from app.db.redis_checkpoint import get_redis_checkpointer
from app.services.chat_history import chat_history_service
from app.models.growth import GrowthIntent
from app.services.stateless_growth_service import stateless_growth_service

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Globals ───────────────────────────────────────────────────────────────────

SHORT_GREETING_REGEX = re.compile(
    r"^(oi|olá|ola|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem|valeu|obrigad[oa]|tchau)[?!.]*$",
    re.IGNORECASE,
)

# ── Request / Response models ─────────────────────────────────────────────────


class ChatRequest(BaseModel):
    message: str
    thread_id: Optional[str] = None  # None → new conversation
    intent_flag: Optional[str] = None
    context_data: Optional[dict] = None
    ephemeral: bool = False


class ChatResponse(BaseModel):
    thread_id: str
    response: str
    cache_hit: bool = False
    next_action: Optional[str] = None


class ResumeRequest(BaseModel):
    thread_id: str
    approved: bool = True  # human approval decision


class ChatHistoryMessage(BaseModel):
    role: Literal["human", "ai"]
    content: str
    timestamp: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class ConversationSummary(BaseModel):
    thread_id: str
    title: str
    ui_summary: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    message_count: int


class ConversationDetail(BaseModel):
    thread_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[ChatHistoryMessage]
    totalMessages: int = 0
    hasMore: bool = False
    sliceStart: int = 0


class MessageSearchResult(BaseModel):
    thread_id: str
    title: str
    score: float
    matched_content: str
    message_index: int
    thread_total: int


class SearchResultsResponse(BaseModel):
    results: list[MessageSearchResult]
    total: int
    has_more: bool


class TitleUpdateRequest(BaseModel):
    title: str


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/stream")
async def stream_message(
    req: ChatRequest,
    current_user_info: dict = Depends(deps.get_current_user_subject),
):
    """
    Process a user message through the LangGraph orchestrator and stream the response.
    """
    current_user_id = current_user_info["email"]
    is_new_thread = req.thread_id is None
    thread_id = req.thread_id or str(uuid.uuid4())
    config = RunnableConfig(configurable={"thread_id": thread_id})

    if is_new_thread:
        await chat_history_service.create_thread_if_not_exists(
            thread_id,
            current_user_id,
            title=chat_history_service.build_provisional_title(req.message),
        )
    else:
        has_access = await chat_history_service.user_has_access(
            thread_id, current_user_id
        )
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found for current user.",
            )

    # Log human message
    await chat_history_service.log_message(
        thread_id, current_user_id, "human", req.message
    )

    initial_state = {
        "messages": [HumanMessage(content=req.message)],
        "user_id": current_user_id,
        "user_name": current_user_info["name"],
        "user_role": current_user_info["role"],
        "thread_id": thread_id,
        "cache_hit": False,
        "agent_decisions": [],
    }

    # === REGEX SHIELD (Fast Conversational Bypass) ===
    if SHORT_GREETING_REGEX.match(req.message.strip()):

        async def regex_shield_generator():
            import json
            from app.services.bedrock_client import get_bedrock_llm
            from langchain_core.messages import SystemMessage

            meta_payload = json.dumps(
                {"event": "metadata", "thread_id": thread_id}, ensure_ascii=False
            )
            yield f"data: {meta_payload}\n\n"

            llm = get_bedrock_llm(streaming=False, model_family="haiku")
            sys_msg = SystemMessage(
                content=f"Você é D'artagnan, um assistente de IA focado em negócios para uma varejista. O usuário {current_user_info['name']} enviou uma mensagem curta/saudação. Responda de forma extremamente curta (max 15 palavras) e muito cordial."
            )
            try:
                response = await llm.ainvoke(
                    [sys_msg, HumanMessage(content=req.message)]
                )
                answer = str(response.content)
            except Exception as e:
                logger.error(f"Failed to invoke Haiku in regex shield: {e}")
                answer = "Olá! Como posso ajudar na sua análise de dados hoje?"

            data_payload = json.dumps({"token": answer}, ensure_ascii=False)
            yield f"data: {data_payload}\n\n"
            yield "data: [DONE]\n\n"

            # Background log
            try:
                await chat_history_service.log_message(
                    thread_id,
                    current_user_id,
                    "ai",
                    answer,
                    {"cache_hit": False, "intent": "general_chat"},
                )
            except Exception as e:
                logger.error(f"Failed to log regex-shield message: {e}")

        return StreamingResponse(
            regex_shield_generator(), media_type="text/event-stream"
        )

    # === FAST PATH ROUTING ===
    if req.intent_flag == GrowthIntent.FAST_PATH.value:

        async def fast_path_generator():
            import json

            meta_payload = json.dumps(
                {"event": "metadata", "thread_id": thread_id}, ensure_ascii=False
            )
            yield f"data: {meta_payload}\n\n"

            # Now consuming the async generator for true streaming
            full_answer = ""
            async for chunk in stateless_growth_service.generate_fast_insight(
                req.message, req.context_data or {}
            ):
                full_answer += chunk
                data_payload = json.dumps({"token": chunk}, ensure_ascii=False)
                yield f"data: {data_payload}\n\n"

            yield "data: [DONE]\n\n"

            # Background log
            try:
                await chat_history_service.log_message(
                    thread_id,
                    current_user_id,
                    "ai",
                    full_answer,
                    {"cache_hit": False, "intent": req.intent_flag},
                )
            except Exception as e:
                logger.error(f"Failed to log fast-path message: {e}")

        return StreamingResponse(fast_path_generator(), media_type="text/event-stream")
    # === END FAST PATH ===

    async def event_generator():
        import json

        full_response: str = ""
        actual_cache_hit = False
        actual_audit_logs = []

        try:
            async with get_redis_checkpointer() as cp:
                if cp is None:
                    raise RuntimeError("Checkpointer is not initialized.")

                graph = await create_compiled_graph(cp)

                # Send thread_id as metadata first
                meta_payload = json.dumps(
                    {"event": "metadata", "thread_id": thread_id}, ensure_ascii=False
                )
                yield f"data: {meta_payload}\n\n"

                async for event in graph.astream_events(
                    initial_state, config=config, version="v2"
                ):
                    kind = event["event"]
                    node_name = event.get("metadata", {}).get("langgraph_node")

                    if kind == "on_chat_model_stream" and node_name in (
                        "response_formatter",
                        "report_agent",
                    ):
                        chunk = event.get("data", {}).get("chunk")
                        if chunk and hasattr(chunk, "content") and chunk.content:
                            content = chunk.content
                            if isinstance(content, list):
                                token = "".join(
                                    block.get("text", "")
                                    for block in content
                                    if isinstance(block, dict)
                                )
                            else:
                                token = str(content)

                            if token:
                                data_payload = json.dumps(
                                    {"token": token}, ensure_ascii=False
                                )
                                yield f"data: {data_payload}\n\n"
                                full_response += token

                # Fallback: if streaming produced no tokens, pull from final state
                if not full_response:
                    try:
                        final_state = await graph.aget_state(config)
                        fallback = final_state.values.get("final_response", "")
                        if fallback:
                            full_response = fallback
                            data_payload = json.dumps(
                                {"token": fallback}, ensure_ascii=False
                            )
                            yield f"data: {data_payload}\n\n"
                            logger.warning(
                                "SSE stream produced 0 tokens; used final_response fallback for thread=%s",
                                thread_id,
                            )
                    except Exception:
                        logger.exception("Failed to retrieve fallback final_response")

                yield "data: [DONE]\n\n"

                try:
                    final_state = await graph.aget_state(config)
                    actual_cache_hit = final_state.values.get("cache_hit", False)
                    actual_audit_logs = final_state.values.get("query_audit_logs", [])
                except Exception:
                    pass

        except Exception as e:
            import traceback

            traceback.print_exc()
            error_payload = json.dumps({"error": str(e)}, ensure_ascii=False)
            yield f"data: {error_payload}\n\n"
            return

        # Pós-stream persistance
        if full_response:
            metadata = {"cache_hit": actual_cache_hit}
            if actual_audit_logs:
                metadata["query_audit_logs"] = actual_audit_logs

            await chat_history_service.log_message(
                thread_id,
                current_user_id,
                "ai",
                full_response,
                metadata,
            )

            from app.services.chat_metadata import chat_metadata_service

            if is_new_thread:
                import asyncio

                asyncio.create_task(
                    chat_metadata_service.generate_and_save_metadata(
                        thread_id=thread_id,
                        user_message=req.message,
                        ai_response=full_response,
                        is_new_thread=True,
                    )
                )
            else:
                try:
                    state = await graph.aget_state(config)
                    if state and state.values.get("messages"):
                        messages = state.values["messages"]
                        if len(messages) >= 20 and len(messages) % 20 == 0:
                            logger.info(
                                f"Threshold reached ({len(messages)} messages). Triggering summarization for thread {thread_id}"
                            )
                            import asyncio

                            asyncio.create_task(
                                chat_metadata_service.generate_and_save_metadata(
                                    thread_id=thread_id,
                                    user_message=req.message,
                                    ai_response=full_response,
                                    is_new_thread=False,
                                    recent_messages=messages,
                                )
                            )
                except Exception as e:
                    logger.error(
                        f"Failed to check message count for summarization trigger: {e}"
                    )

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/message", response_model=ChatResponse)
async def send_message(
    req: ChatRequest,
    background_tasks: BackgroundTasks,
    current_user_info: dict = Depends(deps.get_current_user_subject),
):
    """
    Process a user message through the LangGraph orchestrator.

    - Creates a new thread_id if one is not provided.
    - Returns the formatted response and metadata.
    """
    current_user_id = current_user_info["email"]
    is_new_thread = req.thread_id is None
    thread_id = req.thread_id or str(uuid.uuid4())
    config = RunnableConfig(configurable={"thread_id": thread_id})

    if is_new_thread:
        await chat_history_service.create_thread_if_not_exists(
            thread_id,
            current_user_id,
            title=chat_history_service.build_provisional_title(req.message),
        )
    else:
        has_access = await chat_history_service.user_has_access(
            thread_id, current_user_id
        )
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found for current user.",
            )

    # Log human message
    await chat_history_service.log_message(
        thread_id, current_user_id, "human", req.message
    )

    initial_state = {
        "messages": [HumanMessage(content=req.message)],
        "user_id": current_user_id,
        "user_name": current_user_info["name"],
        "user_role": current_user_info["role"],
        "thread_id": thread_id,
        "cache_hit": False,
        "agent_decisions": [],
    }

    # === REGEX SHIELD (Fast Conversational Bypass) ===
    if SHORT_GREETING_REGEX.match(req.message.strip()):
        try:
            from app.services.bedrock_client import get_bedrock_llm
            from langchain_core.messages import SystemMessage

            llm = get_bedrock_llm(streaming=False, model_family="haiku")
            sys_msg = SystemMessage(
                content=f"Você é D'artagnan, um assistente de IA focado em negócios para uma varejista. O usuário {current_user_info['name']} enviou uma mensagem curta/saudação. Responda de forma extremamente curta (max 15 palavras) e muito cordial."
            )
            response = await llm.ainvoke([sys_msg, HumanMessage(content=req.message)])
            answer = str(response.content)

            background_tasks.add_task(
                chat_history_service.log_message,
                thread_id,
                current_user_id,
                "ai",
                answer,
                {"cache_hit": False, "intent": "general_chat"},
            )

            if is_new_thread:
                from app.services.chat_metadata import chat_metadata_service

                background_tasks.add_task(
                    chat_metadata_service.generate_and_save_metadata,
                    thread_id=thread_id,
                    user_message=req.message,
                    ai_response=answer,
                    is_new_thread=True,
                )

            return ChatResponse(
                thread_id=thread_id,
                response=answer,
                cache_hit=False,
                next_action="general_chat",
            )
        except Exception as e:
            import traceback

            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    # === FAST PATH ROUTING ===
    if req.intent_flag == GrowthIntent.FAST_PATH.value:
        try:
            chunks = []
            async for chunk in stateless_growth_service.generate_fast_insight(
                req.message, req.context_data or {}
            ):
                chunks.append(chunk)
            answer = "".join(chunks)

            background_tasks.add_task(
                chat_history_service.log_message,
                thread_id,
                current_user_id,
                "ai",
                answer,
                {"cache_hit": False, "intent": req.intent_flag},
            )

            if is_new_thread:
                from app.services.chat_metadata import chat_metadata_service

                background_tasks.add_task(
                    chat_metadata_service.generate_and_save_metadata,
                    thread_id=thread_id,
                    user_message=req.message,
                    ai_response=answer,
                    is_new_thread=True,
                )

            return ChatResponse(
                thread_id=thread_id,
                response=answer,
                cache_hit=False,
                next_action=None,
            )
        except Exception as e:
            import traceback

            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))
    # === END FAST PATH ===

    try:
        async with get_redis_checkpointer() as cp:
            if cp is None:
                raise RuntimeError("Checkpointer is not initialized.")

            graph = await create_compiled_graph(cp)

            final_state = await graph.ainvoke(initial_state, config=config)

            response_content = final_state.get("final_response", "")

            metadata = {"cache_hit": final_state.get("cache_hit", False)}
            if "query_audit_logs" in final_state:
                metadata["query_audit_logs"] = final_state.get("query_audit_logs")

            # Log AI response in background
            background_tasks.add_task(
                chat_history_service.log_message,
                thread_id,
                current_user_id,
                "ai",
                response_content,
                metadata,
            )

            if is_new_thread:
                from app.services.chat_metadata import chat_metadata_service

                background_tasks.add_task(
                    chat_metadata_service.generate_and_save_metadata,
                    thread_id=thread_id,
                    user_message=req.message,
                    ai_response=response_content,
                    is_new_thread=True,
                )
            else:
                try:
                    if final_state and final_state.get("messages"):
                        messages = final_state["messages"]
                        if len(messages) >= 20 and len(messages) % 20 == 0:
                            from app.services.chat_metadata import chat_metadata_service

                            logger.info(
                                f"Threshold reached ({len(messages)} messages). Triggering summarization for thread {thread_id}"
                            )
                            background_tasks.add_task(
                                chat_metadata_service.generate_and_save_metadata,
                                thread_id=thread_id,
                                user_message=req.message,
                                ai_response=response_content,
                                is_new_thread=False,
                                recent_messages=messages,
                            )
                except Exception as e:
                    logger.error(
                        f"Failed to check message count for summarization trigger: {e}"
                    )

            return ChatResponse(
                thread_id=thread_id,
                response=response_content,
                cache_hit=final_state.get("cache_hit", False),
                next_action=final_state.get("next_action"),
            )

    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/resume", response_model=ChatResponse)
async def resume_graph(
    req: ResumeRequest,
    background_tasks: BackgroundTasks,
    current_user_info: dict = Depends(deps.get_current_user_subject),
):
    """
    Resume a graph that was interrupted waiting for human validation.

    If `approved=True`, the graph continues to response_formatter.
    If `approved=False`, the graph is aborted and the user is notified.
    """
    current_user_id = current_user_info["email"]
    has_access = await chat_history_service.user_has_access(
        req.thread_id, current_user_id
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found for current user.",
        )

    if not req.approved:
        # Log human cancellation
        await chat_history_service.log_message(
            req.thread_id,
            current_user_id,
            "human",
            "[Ação cancelada pelo usuário]",
        )
        return ChatResponse(
            thread_id=req.thread_id,
            response="❌ Ação cancelada pelo usuário.",
        )

    # Log human approval
    await chat_history_service.log_message(
        req.thread_id, current_user_id, "human", "[Ação aprovada pelo usuário]"
    )

    config = RunnableConfig(configurable={"thread_id": req.thread_id})

    try:
        async with get_redis_checkpointer() as cp:
            if cp is None:
                raise RuntimeError("Checkpointer is not initialized.")

            graph = await create_compiled_graph(cp)

            final_state = await graph.ainvoke(None, config=config)

            response_content = final_state.get("final_response", "")

            metadata = {"cache_hit": final_state.get("cache_hit", False)}
            if "query_audit_logs" in final_state:
                metadata["query_audit_logs"] = final_state.get("query_audit_logs")

            # Log AI response in background
            background_tasks.add_task(
                chat_history_service.log_message,
                req.thread_id,
                current_user_id,
                "ai",
                response_content,
                metadata,
            )

            return ChatResponse(
                thread_id=req.thread_id,
                response=response_content,
                cache_hit=final_state.get("cache_hit", False),
                next_action=final_state.get("next_action"),
            )

    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversations", response_model=list[ConversationSummary])
async def list_conversations(
    current_user_info: dict = Depends(deps.get_current_user_subject),
):
    current_user_id = current_user_info["email"]
    try:
        threads = await chat_history_service.list_threads(current_user_id)
        now = datetime.now(timezone.utc)

        return [
            ConversationSummary(
                thread_id=thread["thread_id"],
                title=thread.get("title") or "Nova conversa",
                ui_summary=thread.get("ui_summary"),
                created_at=thread.get("created_at") or now,
                updated_at=thread.get("updated_at") or thread.get("created_at") or now,
                message_count=len(thread.get("messages", [])),
            )
            for thread in threads
        ]
    except Exception as exc:
        logger.exception("Failed to list conversations for user %s", current_user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível carregar o histórico de conversas.",
        ) from exc


@router.get("/conversations/{thread_id}", response_model=ConversationDetail)
async def get_conversation(
    thread_id: str,
    current_user_info: dict = Depends(deps.get_current_user_subject),
    limit: int = Query(
        default=20, ge=1, le=100, description="Number of messages to return"
    ),
    skip: int = Query(
        default=0, ge=0, description="Number of messages to skip from the end"
    ),
):
    current_user_id = current_user_info["email"]
    try:
        history = await chat_history_service.get_thread_messages_paginated(
            thread_id, current_user_id, limit=limit, skip=skip
        )
    except Exception as exc:
        logger.exception(
            "Failed to fetch conversation %s for user %s", thread_id, current_user_id
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível carregar a conversa.",
        ) from exc

    if not history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found for current user.",
        )

    now = datetime.now(timezone.utc)
    return ConversationDetail(
        thread_id=thread_id,
        title=history.get("title") or "Nova conversa",
        created_at=history.get("created_at") or now,
        updated_at=history.get("updated_at") or history.get("created_at") or now,
        messages=[
            ChatHistoryMessage(
                role=m.get("sender") or m.get("role", "ai"),
                content=m["content"],
                timestamp=m.get("timestamp") or now,
                metadata=m.get("metadata") or {},
            )
            for m in history["messages"]
        ],
        totalMessages=history["totalMessages"],
        hasMore=history["hasMore"],
        sliceStart=history["sliceStart"],
    )


@router.delete("/conversations/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    thread_id: str,
    current_user_info: dict = Depends(deps.get_current_user_subject),
):
    current_user_id = current_user_info["email"]
    deleted = await chat_history_service.delete_thread(thread_id, current_user_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found for current user.",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/search", response_model=SearchResultsResponse)
async def search_messages(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(default=10, ge=1, le=50, description="Results per page"),
    skip: int = Query(default=0, ge=0, description="Results to skip (for pagination)"),
    current_user_info: dict = Depends(deps.get_current_user_subject),
):
    """
    Full-text search across all messages belonging to the authenticated user.

    Returns results sorted by relevance (MongoDB textScore), each containing
    the chat thread title, a content snippet around the matched term, and the
    0-based index of the matching message within the thread (for deep-link scroll).
    """
    current_user_id = current_user_info["email"]
    query = q.strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O parâmetro 'q' não pode ser vazio.",
        )

    try:
        raw = await chat_history_service.search_messages(
            user_id=current_user_id,
            query=query,
            limit=limit,
            skip=skip,
        )
    except Exception as exc:
        logger.exception(
            "Failed to search messages for user %s, query '%s'",
            current_user_id,
            query,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao realizar a busca de mensagens.",
        ) from exc

    return SearchResultsResponse(
        results=[
            MessageSearchResult(
                thread_id=r["thread_id"],
                title=r["title"],
                score=r["score"],
                matched_content=r["matched_content"],
                message_index=r["message_index"],
                thread_total=r["thread_total"],
            )
            for r in raw["results"]
        ],
        total=raw["total"],
        has_more=raw["has_more"],
    )


@router.put("/conversations/{thread_id}/title")
async def update_conversation_title(
    thread_id: str,
    payload: TitleUpdateRequest,
    current_user_info: dict = Depends(deps.get_current_user_subject),
):
    """
    Update the title of a specific conversation thread.
    """
    current_user_id = current_user_info["email"]
    has_access = await chat_history_service.user_has_access(thread_id, current_user_id)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found for current user.",
        )

    success = await chat_history_service.update_thread_title(thread_id, payload.title)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update conversation title.",
        )

    return {"status": "success", "title": payload.title}
