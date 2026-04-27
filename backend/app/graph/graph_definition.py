"""
LangGraph Orchestrator — Graph Assembly

This module defines, compiles, and exports the StateGraph.

Flow:
  START
    └─► intent_classifier
          ├─► (sql_query)       → cache_checker
          │     ├─► (cache_hit=True)   → response_formatter
          │     └─► (cache_hit=False)  → sql_agent (ReAct)
          │                               └─► response_formatter
          ├─► (report_charts/weekly) → report_agent
          ├─► (general_chat)    → response_formatter
          └─► (validation_needed) → [INTERRUPT] → response_formatter
    END
"""

from langgraph.graph import END, START, StateGraph
from langgraph.checkpoint.redis.aio import AsyncRedisSaver  # pyright: ignore[reportMissingImports]

from app.graph.state import GraphState
from app.graph.nodes.agents.intent_classifier.agent import intent_classifier
from app.graph.nodes.tools.cache_checker import cache_checker
from app.graph.nodes.agents.sql_agent.agent import sql_agent
from app.graph.nodes.agents.response_formatter.agent import response_formatter
from app.graph.nodes.agents.report_agent.agent import report_agent


# ── Routing functions (conditional edges) ─────────────────────────────────────


def _route_after_classifier(state: GraphState) -> str:
    """Route based on the intent classifier's output."""
    intent = state.get("next_action", "general_chat")
    if intent in ("sql_query_new", "sql_query_followup"):
        return "cache_checker"
    elif intent in ("report_charts", "report_weekly"):
        return "report_agent"
    elif intent == "validation_needed":
        return "human_validation"
    else:
        return "response_formatter"


def _route_after_cache(state: GraphState) -> str:
    """Short-circuit to formatter on cache hit, otherwise invoke the SQL agent."""
    if state.get("cache_hit"):
        return "response_formatter"
    return "sql_agent"


async def human_validation(state: GraphState) -> dict:
    """Dummy node. The graph interrupts BEFORE this node when validation is needed."""
    return {}


# ── Graph builder ──────────────────────────────────────────────────────────────


def build_graph() -> StateGraph:
    """Construct and return the compiled StateGraph (without checkpointer)."""
    builder = StateGraph(GraphState)

    # ── Nodes ────────────────────────────────────────────────────────────
    builder.add_node("intent_classifier", intent_classifier)
    builder.add_node("cache_checker", cache_checker)
    builder.add_node("sql_agent", sql_agent)
    builder.add_node("human_validation", human_validation)
    builder.add_node("response_formatter", response_formatter)
    builder.add_node("report_agent", report_agent)

    # ── Edges ─────────────────────────────────────────────────────────────
    builder.add_edge(START, "intent_classifier")

    builder.add_conditional_edges(
        "intent_classifier",
        _route_after_classifier,
        {
            "cache_checker": "cache_checker",
            "report_agent": "report_agent",
            "human_validation": "human_validation",
            "response_formatter": "response_formatter",
        },
    )

    builder.add_conditional_edges(
        "cache_checker",
        _route_after_cache,
        {
            "response_formatter": "response_formatter",
            "sql_agent": "sql_agent",
        },
    )

    # SQL Agent always hands off to formatter (it may also write final_response on error)
    builder.add_edge("sql_agent", "response_formatter")

    # Validation and all exit paths
    builder.add_edge("human_validation", "response_formatter")
    builder.add_edge("response_formatter", END)
    builder.add_edge("report_agent", END)

    return builder


async def create_compiled_graph(checkpointer: AsyncRedisSaver):
    """
    Compile the graph with a Redis checkpointer.

    Args:
        checkpointer: The initialized AsyncRedisSaver.

    Returns:
        A compiled LangGraph application ready to invoke.
    """
    return build_graph().compile(
        checkpointer=checkpointer,
        interrupt_before=["human_validation"],  # Intercept ONLY validation requests
    )
