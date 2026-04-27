"""
LangGraph State definition.

All nodes read from and write to this TypedDict. LangGraph merges the partial
dict returned by each node into the current state via the reducers declared
with Annotated.
"""

from typing import Annotated, Any, Optional, Dict
import operator
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages


class GraphState(TypedDict):
    # ── Conversation context ──────────────────────────────────────────────
    messages: Annotated[list, add_messages]
    """Full conversation history. LangGraph appends new messages via add_messages."""

    user_id: Optional[str]
    """Identifier of the authenticated user (for MongoDB audit logs)."""

    user_name: Optional[str]
    """Extracted from JWT. Used for dynamic prompts."""

    user_role: Optional[str]
    """Extracted from JWT. Used for prompt safety/access control (e.g. ADMIN vs USER)."""

    thread_id: Optional[str]
    """Unique conversation ID used as checkpoint key in Redis."""

    summary: Optional[str]
    """Dense technical summary of the conversation context to provide the AI agent with past knowledge while saving tokens."""

    # ── Routing ───────────────────────────────────────────────────────────
    next_action: Optional[str]
    """
    Routing decision set by the intent_classifier.
    Possible values: 'sql_query_new' | 'sql_query_followup' | 'report_charts' | 'report_weekly' | 'general_chat' | 'validation_needed'
    """

    # ── Cache ─────────────────────────────────────────────────────────────
    cache_hit: bool
    """True when cache_checker found a valid cached response."""

    # ── Agent audit trail ─────────────────────────────────────────────────
    agent_decisions: Annotated[list, operator.add]
    """Audit log of reasoning steps produced by any agent node."""

    query_audit_logs: Annotated[list, operator.add]
    """Telemetry and audit trail for SQL generation and execution attempts."""

    # ── SQL pipeline ──────────────────────────────────────────────────────
    query_result: Optional[Any]
    """Raw result returned by sql_agent after executing the Databricks query (list of dicts)."""

    # ── User-facing output ────────────────────────────────────────────────
    final_response: Optional[str]
    """Markdown-formatted response produced by response_formatter or sql_agent on error."""

    # ── Report Agent pipeline ─────────────────────────────────────────────
    report_section_results: Optional[Any]
    """Legacy structured JSON payload collected by the Report Agent's MCP loop."""

    # ── Executive Presentation pipeline ───────────────────────────────────
    slide_agenda: Optional[Dict[str, Any]]
    slide_positives: Optional[Dict[str, Any]]
    slide_results: Optional[Dict[str, Any]]
    slide_gaps: Optional[Dict[str, Any]]
    slide_insights: Optional[Dict[str, Any]]


