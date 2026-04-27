"""
SSE Streaming generator for the LangGraph chat pipeline.

This module exposes two public symbols:

  ``validate_and_prepare_stream(message, thread_id, user_id)``
      A **plain async coroutine** (not a generator).  Call this *before*
      constructing the ``StreamingResponse`` so that access-control failures
      can be raised as ``PermissionError`` at the endpoint level and converted
      to an HTTP 403 before any bytes are sent to the client.
      Returns the resolved ``thread_id`` (a new UUID for new conversations).

  ``stream_graph_sse(message, tid, user_id)``
      The **async generator** driven by ``StreamingResponse``.  Receives the
      already-validated ``tid`` from ``validate_and_prepare_stream`` so it
      only deals with graph execution and token forwarding.

SSE event format:
  ``event: metadata`` + ``data: {thread_id, cache_hit}``  -- first event
  ``data: <token>``                                        -- individual tokens
  ``data: [DONE]``                                         -- end signal
  ``event: error``  + ``data: {detail}``                   -- on exception
"""

import json
import logging
import uuid
from typing import AsyncGenerator

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig

from app.db.redis_checkpoint import get_redis_checkpointer
from app.graph.graph_definition import create_compiled_graph
from app.services.chat_history import chat_history_service

logger = logging.getLogger(__name__)

# Node names that produce the final, user-facing LLM response.
_STREAMING_NODES = frozenset({"response_formatter", "report_agent"})


def _harvest_token_usage(chunk: object) -> dict | None:
    """
    Safely extract a usage_metadata dict from an AIMessageChunk.

    The Anthropic Bedrock API distributes token counts across stream chunks:
      - First chunk  → ``usage_metadata.input_tokens``  (message_start event)
      - Last chunk   → ``usage_metadata.output_tokens`` (message_delta event)

    Both chunks may also carry a ``total_tokens`` key when the provider
    computes it; we read it defensively and let callers sum the values.

    Supports both plain ``dict`` and Pydantic-like ``UsageMetadata`` objects
    that some LangChain versions may return.

    Returns None if the chunk carries no usage information.
    """
    usage = getattr(chunk, "usage_metadata", None)
    if not usage:
        return None

    # Unified accessor: works for dict and attribute-based objects.
    def _get(obj: object, key: str, default: int = 0) -> int:
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    input_t = _get(usage, "input_tokens", 0)
    output_t = _get(usage, "output_tokens", 0)
    total_t = _get(usage, "total_tokens", 0)

    # Only return if at least one token count is non-zero to avoid noise
    if not any([input_t, output_t, total_t]):
        return None

    result = {
        "input_tokens": input_t,
        "output_tokens": output_t,
        "total_tokens": total_t,
    }
    logger.debug("Harvested token usage from chunk: %s", result)
    return result


async def validate_and_prepare_stream(
    message: str,
    thread_id: str | None,
    user_id: str,
) -> str:
    """
    Eagerly validate access and create / resolve the thread *before* the
    ``StreamingResponse`` is constructed.

    This is a plain ``async def`` (not a generator) so that exceptions —
    especially ``PermissionError`` — propagate to the FastAPI endpoint and
    can be converted to proper 4xx responses before any HTTP body is sent.

    Returns:
        The resolved thread_id (new UUID for new conversations).

    Raises:
        PermissionError: if ``thread_id`` is provided but the user has no access.
    """
    is_new_thread = thread_id is None
    tid: str = thread_id or str(uuid.uuid4())

    if is_new_thread:
        await chat_history_service.create_thread_if_not_exists(
            tid,
            user_id,
            title=chat_history_service.build_provisional_title(message),
        )
    else:
        has_access = await chat_history_service.user_has_access(tid, user_id)
        if not has_access:
            raise PermissionError(f"Thread {tid!r} not found for user {user_id!r}.")

    # Log the human message here so it is persisted before any token arrives.
    await chat_history_service.log_message(tid, user_id, "human", message)

    return tid


async def stream_graph_sse(
    message: str,
    tid: str,
    user_id: str,
) -> AsyncGenerator[str, None]:
    """
    Async SSE generator for a single user turn.

    Pre-conditions: ``validate_and_prepare_stream`` has already been called;
    ``tid`` is a verified, existing thread and the human message has been logged.

    Yields:
        RFC-compliant SSE lines terminated with double newlines.
    """
    # ── Build graph state ─────────────────────────────────────────────────────

    initial_state = {
        "messages": [HumanMessage(content=message)],
        "user_id": user_id,
        "thread_id": tid,
        "cache_hit": False,
        "agent_decisions": [],
        "query_result": None,       # Reset: prevent stale data from prior turn
        "next_action": None,        # Reset: prevent inheriting previous routing
        "final_response": None,     # Reset: prevent prior response leaking
    }
    config = RunnableConfig(configurable={"thread_id": tid})

    # ── Stream ────────────────────────────────────────────────────────────────

    accumulated_tokens: list[str] = []
    final_cache_hit: bool = False
    final_audit_logs: list = []

    # ── Token accounting ──────────────────────────────────────────────────────
    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_total_tokens = 0

    try:
        # Emit metadata event so frontend has the real thread_id before token 1.
        metadata_payload = json.dumps({"thread_id": tid, "cache_hit": False})
        yield f"event: metadata\ndata: {metadata_payload}\n\n"

        async with get_redis_checkpointer() as cp:
            if cp is None:
                raise RuntimeError("Redis checkpointer is not initialised.")

            graph = await create_compiled_graph(cp)

            async for event in graph.astream_events(
                initial_state, config=config, version="v2"
            ):
                event_name: str = event.get("event", "")

                # ── on_chat_model_stream: forward text AND harvest tokens ──
                if event_name == "on_chat_model_stream":
                    chunk = event["data"].get("chunk")
                    if chunk is None:
                        continue

                    # 1. Harvest token usage from every node (sql_agent, intent_classifier,
                    #    response_formatter, etc.).  The Anthropic/Bedrock SSE protocol
                    #    spreads usage across the first and last chunks of the completion;
                    #    we accumulate here with each pass so we never miss either end.
                    usage = _harvest_token_usage(chunk)
                    if usage:
                        total_prompt_tokens += usage.get("input_tokens", 0)
                        total_completion_tokens += usage.get("output_tokens", 0)
                        # total_tokens may be sent explicitly; sum it only when present
                        # and non-zero to avoid double-counting with prompt+completion.
                        explicit_total = usage.get("total_tokens", 0)
                        if explicit_total:
                            total_total_tokens += explicit_total

                    # 2. Forward visible text tokens to SSE — only for user-facing nodes.
                    if event.get("metadata", {}).get("langgraph_node") not in _STREAMING_NODES:
                        continue

                    content = chunk.content
                    if isinstance(content, list):
                        # Bedrock content-block format: [{"type":"text","text":"..."}]
                        token = "".join(
                            block.get("text", "")
                            for block in content
                            if isinstance(block, dict)
                        )
                    else:
                        token = str(content)

                    if not token:
                        continue

                    accumulated_tokens.append(token)
                    # SSE data lines must not contain raw newlines; encode them.
                    safe_token = token.replace("\n", "\\n")
                    yield f"data: {safe_token}\n\n"

                # ── Capture final state for post-stream persistence ────────
                elif event_name == "on_chain_end" and event.get("name") == "LangGraph":
                    output = event.get("data", {}).get("output", {})
                    if isinstance(output, dict):
                        final_cache_hit = output.get("cache_hit", False)
                        final_audit_logs = output.get("query_audit_logs", [])
                        final_res = output.get("final_response")
                        
                        # If report_agent generated a perfect JSON payload silently in Phase 2,
                        # it won't be in accumulated_tokens. We must push it to the frontend!
                        if final_res and "{" in final_res and "}" in final_res:
                            # Heuristic: If accumulated tokens was just the CoT (e.g. "Iniciando coleta...")
                            # we append a delimiter and the full JSON.
                            json_str = f"\n\n```json\n{final_res}\n```\n"
                            accumulated_tokens.append(json_str)
                            safe_token = json_str.replace("\n", "\\n")
                            yield f"data: {safe_token}\n\n"

    except Exception as exc:
        error_payload = json.dumps({"detail": str(exc)})
        logger.exception("SSE stream error for user=%s thread=%s", user_id, tid)
        yield f"event: error\ndata: {error_payload}\n\n"
        raise

    finally:
        # ── Post-stream persistence (runs after last yield) ────────────────
        full_response = "".join(accumulated_tokens)

        # Log accumulated token usage for observability
        if total_prompt_tokens or total_completion_tokens:
            logger.info(
                "Token usage for thread=%s: prompt=%d, completion=%d, total=%d",
                tid, total_prompt_tokens, total_completion_tokens, total_total_tokens,
            )

        if full_response:
            try:
                metadata = {
                    "cache_hit": final_cache_hit,
                    "token_usage": {
                        "prompt_tokens": total_prompt_tokens,
                        "completion_tokens": total_completion_tokens,
                        "total_tokens": total_total_tokens,
                    },
                }
                if final_audit_logs:
                    metadata["query_audit_logs"] = final_audit_logs

                await chat_history_service.log_message(
                    tid,
                    user_id,
                    "ai",
                    full_response,
                    metadata,
                )
            except Exception:
                logger.exception("Failed to persist AI message for thread=%s", tid)

    # ── Signal end of stream ──────────────────────────────────────────────────
    yield "data: [DONE]\n\n"
