"""
Node: intent_classifier

Entry point of the graph. Uses Claude (via ChatBedrock) to classify the user's
latest message into one of routing categories using Structured Outputs.
"""

from enum import Enum
from pathlib import Path
from pydantic import BaseModel, Field
from langchain_core.messages import SystemMessage

from app.graph.state import GraphState
from app.services.bedrock_client import get_bedrock_llm
from app.utils.loader import load_prompt
from app.core.prompts import build_dynamic_system_prompt

_PROMPT_PATH = Path(__file__).parent / "system_prompt.md"


class Intent(str, Enum):
    SQL_QUERY_NEW = "sql_query_new"
    SQL_QUERY_FOLLOWUP = "sql_query_followup"
    REPORT_CHARTS = "report_charts"
    REPORT_WEEKLY = "report_weekly"
    GENERAL_CHAT = "general_chat"
    VALIDATION_NEEDED = "validation_needed"


class IntentClassification(BaseModel):
    """Modelo rigoroso de classificação de intenção do usuário."""

    intent: Intent = Field(description="A intenção classificada da mensagem do usuário")


async def intent_classifier(state: GraphState) -> dict:
    """Classify the user's intent and set next_action in state."""
    llm = get_bedrock_llm(streaming=False, model_family="haiku")

    # Load system prompt dynamically
    base_prompt_content = load_prompt(_PROMPT_PATH)
    system_prompt_content = build_dynamic_system_prompt(
        user_name=state.get("user_name") or "Usuário",
        user_role=state.get("user_role") or "USER",
        agent_base_instructions=base_prompt_content,
    )

    # Extract the last few messages to provide context for follow-up detection
    # We take up to 5 to avoid token bloat, ensuring the classifier understands the flow
    recent_messages = state.get("messages", [])[-5:]

    # Bind the structured output schema
    classifier_llm = llm.with_structured_output(IntentClassification)

    # Invoke the model to get a strict Pydantic object
    try:
        response = await classifier_llm.ainvoke(
                [SystemMessage(content=system_prompt_content)] + recent_messages
        )
        # Handle the case where the LLM might return a dict or BaseModel depending on LangChain version
        if isinstance(response, IntentClassification):
            intent_val = response.intent.value
        elif isinstance(response, dict) and "intent" in response:
            intent_val = response["intent"]
        else:
            intent_val = Intent.GENERAL_CHAT.value
    except Exception:
        # Fallback in case of parsing errors or unexpected LLM issues
        intent_val = Intent.GENERAL_CHAT.value

    return {"next_action": intent_val}
