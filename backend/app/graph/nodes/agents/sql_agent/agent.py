"""
Node: sql_agent

A ReAct (Reason + Act) agent that autonomously decides which table(s) to query,
writes optimized SQL, and executes it via the execute_databricks_query tool.

This single agent replaces the following legacy nodes:
  - router_agent (main_agent)
  - tb-vpcf_agent
  - tb-ciclo_vida_agent
  - tb-ecom_comp_agent
  - sql_generator

Retry logic is handled natively by the ReAct loop: if the tool returns an error,
the LLM observes it and automatically produces a corrected query.
"""

from pathlib import Path
from typing import Any, List

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)

from app.graph.state import GraphState
from app.services.bedrock_client import get_bedrock_llm
from app.utils.loader import load_prompt
from app.core.prompts import build_dynamic_system_prompt
from app.graph.nodes.tools.databricks_tools import execute_databricks_query

_PROMPT_PATH = Path(__file__).parent / "system_prompt.md"

# Maximum tool-call iterations the ReAct loop is allowed to perform per request.
# Each iteration = one SQL attempt (including retries on error).
_MAX_ITERATIONS = 3

# Maximum number of previous conversation messages (Human + AI pairs)
# to include as context for the current ReAct loop.
# Controls token budget: each pair ≈ 2 messages → 5 pairs = 10 messages.
_MAX_CONTEXT_MESSAGES = 10


def _build_conversation_context(
    all_messages: List[Any], last_human_index: int
) -> List[BaseMessage]:
    """
    Extract recent Human/AI message pairs from the conversation history.

    Filters out internal ToolMessages and SystemMessages (artifacts of previous
    ReAct loops) to provide only the user-facing conversational context.
    This enables the SQL agent to understand follow-up questions that reference
    temporal filters, entities, or metrics from previous exchanges.

    Args:
        all_messages: Full message list from GraphState["messages"].
        last_human_index: Index of the current (latest) HumanMessage.

    Returns:
        List of recent HumanMessage/AIMessage objects, capped at
        _MAX_CONTEXT_MESSAGES to control token usage.
    """
    if last_human_index <= 0:
        return []

    # Keep only Human and AI messages (skip ToolMessages and SystemMessages)
    relevant_history: List[BaseMessage] = [
        msg
        for msg in all_messages[:last_human_index]
        if isinstance(msg, (HumanMessage, AIMessage))
    ]

    # Cap to the most recent N messages to control token budget
    return relevant_history[-_MAX_CONTEXT_MESSAGES:]


async def sql_agent(state: GraphState) -> dict:
    """
    ReAct agent that translates the user's question into SQL and executes it.

    The agent has access to execute_databricks_query and will:
    1. Reason about which table(s) are needed.
    2. Generate and execute SQL via the tool.
    3. Self-correct if the tool returns an error (up to _MAX_ITERATIONS times).

    Returns:
        Partial GraphState update with `query_result` populated on success,
        or `final_response` set to an error message if all retries are exhausted.
    """
    llm = get_bedrock_llm()

    # ── Build dynamic system prompt with user context + catalog DDLs ──────
    base_instructions = load_prompt(_PROMPT_PATH)
    system_prompt = build_dynamic_system_prompt(
        user_name=state.get("user_name") or "Usuário",
        user_role=state.get("user_role") or "USER",
        agent_base_instructions=base_instructions,
    )

    summary = state.get("summary", "")
    if summary:
        system_prompt = f"RESUMO DO CONTEXTO ANTERIOR:\n{summary}\n\n{system_prompt}"

    # ── Extract conversation context ──────────────────────────────────────
    all_messages = state.get("messages", [])

    # Locate the latest human message (the current user question)
    last_human_index = -1
    last_human_msg = ""
    for i in range(len(all_messages) - 1, -1, -1):
        if isinstance(all_messages[i], HumanMessage):
            last_human_index = i
            last_human_msg = all_messages[i].content
            break

    # Build conversational context from previous exchanges
    conversation_context = _build_conversation_context(all_messages, last_human_index)

    # Bind the Databricks execution tool to the model
    llm_with_tools = llm.bind_tools([execute_databricks_query])

    # ── ReAct loop ────────────────────────────────────────────────────────
    intent = state.get("next_action")
    if intent == "sql_query_new":
        # Isolate the context for a brand new analytical inquiry
        messages: list[BaseMessage] = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=last_human_msg),
        ]
    else:
        # For sql_query_followup: use filtered conversation context (Human+AI only)
        # to avoid contaminating the ReAct loop with ToolMessages from prior turns.
        messages: list[BaseMessage] = [
            SystemMessage(content=system_prompt),
            *conversation_context,
            HumanMessage(content=last_human_msg),
        ]

    collected_audits = []

    successful_rows: List[Any] = []
    saw_success_with_empty_result = False

    for iteration in range(_MAX_ITERATIONS):
        response: Any = await llm_with_tools.ainvoke(messages)
        messages.append(response)

        # No tool calls → model produced a final text answer (no query needed)
        if not getattr(response, "tool_calls", None):
            return {
                "query_result": None,
                "final_response": response.content,
                "query_audit_logs": collected_audits,
            }

        # Execute every tool call the model requested
        tool_results = []

        for tool_call in response.tool_calls:
            if tool_call["name"] == "execute_databricks_query":
                args = tool_call["args"]
                result = await execute_databricks_query.ainvoke(args)
                rows = result.get("result", []) if isinstance(result, dict) else []
                row_count = len(rows) if isinstance(rows, list) else 0

                # Format response for the LLM
                # We optionally strip 'result' if we don't want to overwhelm context, but str(result) is existing behavior
                tool_results.append(
                    {
                        "tool_call_id": tool_call["id"],
                        "name": tool_call["name"],
                        "content": str(result),
                    }
                )

                # Append to our audit logs collection for this turn
                if isinstance(result, dict):
                    audit_entry = {
                        "original prompt": last_human_msg,
                        "raw_sql": result.get("raw_sql", args.get("query", "")),
                        "reasoning": result.get("reasoning", args.get("reasoning", "")),
                        "execution_time_ms": result.get("execution_time_ms", 0),
                        "row_count": row_count,
                        "status": result.get("status", "Error"),
                        "error_message": result.get("error_message", ""),
                    }
                    collected_audits.append(audit_entry)

                    # Capture successful rows for the state. Empty result sets are
                    # not treated as terminal success: they are fed back into the
                    # ReAct loop so the model can correct joins/filters.
                    if result.get("status") == "Success":
                        if row_count > 0:
                            successful_rows.extend(rows)
                        else:
                            saw_success_with_empty_result = True

        # Append tool results as ToolMessages so the LLM sees them
        for tr in tool_results:
            messages.append(
                ToolMessage(
                    content=tr["content"],
                    tool_call_id=tr["tool_call_id"],
                )
            )

        # If we got a non-empty successful result, exit the loop.
        if successful_rows:
            return {
                "query_result": successful_rows,
                "query_audit_logs": collected_audits,
            }

        # Empty result sets are analytically meaningful feedback, but they should
        # not stop the loop immediately. Give the model a chance to revise the SQL
        # using the tool output it just saw.

    # All retries exhausted without a successful result
    if saw_success_with_empty_result:
        return {
            "query_result": [],
            "query_audit_logs": collected_audits,
        }

    return {
        "query_result": None,
        "query_audit_logs": collected_audits,
        "final_response": (
            "Não foi possível executar a consulta após várias tentativas. "
            "Por favor, reformule sua pergunta ou contate o suporte técnico."
        ),
    }
