import logging
from typing import Dict, Any, List, AsyncGenerator

from langchain_core.messages import SystemMessage, HumanMessage
from app.services.bedrock_client import get_bedrock_llm
from app.models.growth import FilteredSnapshot, CorrelationItem, PeerMetric

logger = logging.getLogger(__name__)


class StatelessGrowthService:
    def __init__(self):
        # Using the standard Sonnet model via Bedrock without streaming initially
        # Can easily be adapted to streaming if needed in the frontend
        self.llm = get_bedrock_llm(streaming=False)

    def _extract_top_3_correlations(
        self, raw_context: Dict[str, Any]
    ) -> List[CorrelationItem]:
        """
        Mocks the Infrastructure Layer analytical engine logic.
        In production, this would parse Databricks outputs and return strictly the Top 3.
        For now, if context provides data, we filter it synthetically or just pass it cleanly.
        """
        # Example logic: if the context has 'correlations', sort and take top 3.
        # Since we are mocking the true analytical engine from Databricks, we will synthesize it based on the metric.
        # Real implementation would run statistical correlation over historical data.

        # This is a placeholder for the actual infrastructure logic.
        correlations = raw_context.get("correlations", [])
        if not correlations:
            return []

        # Ensure it's sorted by absolute score (highest impact first)
        sorted_correlations = sorted(
            correlations, key=lambda x: abs(x.get("correlation_score", 0)), reverse=True
        )

        return [
            CorrelationItem(
                factor=c.get("factor", "Unknown Factor"),
                correlation_score=c.get("correlation_score", 0.0),
                description=c.get("description", "Direct influence"),
            )
            for c in sorted_correlations[:3]
        ]

    def _create_snapshot(self, context_data: Dict[str, Any]) -> FilteredSnapshot:
        """
        Converts the frontend raw context into a strict FilteredSnapshot Domain Entity.
        """

        # Determine if payload is using the new Holistic approach { selected: {...}, all_metrics: [...] }
        # or the legacy flat approach
        selected = context_data.get("selected", context_data)
        all_metrics_raw = context_data.get("all_metrics", [])

        metric_name = selected.get("metric_name") or selected.get(
            "title", "Desconhecido"
        )
        current_val = selected.get("current_value") or selected.get("value", "N/A")
        prev_val = selected.get("previous_value", "N/A")
        var = selected.get("variance") or selected.get("change_percentage", "N/A")

        # Parse Peer Metrics
        peer_metrics = []
        for m in all_metrics_raw:
            # Skip the selected metric itself
            if m.get("id") == selected.get("id") or m.get("title") == metric_name:
                continue

            sentiment = "stable"
            if m.get("is_improvement") is True:
                sentiment = "improvement"
            elif m.get("is_improvement") is False:
                sentiment = "decline"

            peer_metrics.append(
                PeerMetric(
                    title=m.get("title", "Unknown"),
                    value=str(m.get("value", "N/A")),
                    variance=str(m.get("change_percentage", "N/A")),
                    sentiment=sentiment,
                )
            )

        return FilteredSnapshot(
            metric_name=metric_name,
            current_value=current_val,
            previous_value=prev_val,
            variance=var,
            sentiment=selected.get("sentiment", "neutral"),
            top_correlations=self._extract_top_3_correlations(selected),
            peer_metrics=peer_metrics,
            additional_context={"raw_data": selected.get("chart_data", {})},
        )

    def format_cot_prompt(self, snapshot: FilteredSnapshot, user_question: str) -> str:
        """
        Constructs the Chain-of-Thought surgical prompt.
        """
        correlations_text = ""
        if snapshot.top_correlations:
            correlations_text = "\nFATORES DE CORRELAÇÃO ESTÁTICOS:\n"
            for idx, c in enumerate(snapshot.top_correlations, 1):
                correlations_text += f"  {idx}. {c.factor} (Força: {c.correlation_score:.2f}) -> {c.description}\n"

        # Format Global Context Table
        global_context_text = ""
        if snapshot.peer_metrics:
            global_context_text = "\n=== GLOBAL DASHBOARD CONTEXT ===\n"
            global_context_text += "| Métrica | Valor | Variação | Sentimento |\n"
            global_context_text += "|---|---|---|---|\n"
            for p in snapshot.peer_metrics:
                global_context_text += (
                    f"| {p.title} | {p.value} | {p.variance} | {p.sentiment} |\n"
                )
        else:
            global_context_text = "\n=== GLOBAL DASHBOARD CONTEXT ===\n Dados de outras métricas não fornecidos no snapshot atual.\n"

        prompt = f"""Você é um Cientista de Dados Sênior Especialista em Growth.
O usuário está fazendo uma pergunta sobre a métrica principal (Selected Metric). Você DEVE usar o cenário global abaixo para responder.
Sua resposta deve ser executiva, direta, e focada em anomalias ou correlações cruzadas.

=== SELECTED METRIC ===
Métrica: {snapshot.metric_name}
Valor Atual: {snapshot.current_value}
Valor Anterior: {snapshot.previous_value}
Variação: {snapshot.variance}
Sentimento Principal: {snapshot.sentiment}
{correlations_text}
{global_context_text}
=== INSTRUÇÕES DE ANÁLISE (CoT) ===
Siga este formato mental (mas entregue um texto fluido em markdown):
1. **Observação**: Reconheça o comportamento da métrica principal.
2. **Anomalias Coincidentes (Crucial)**: Analise se a variação na métrica principal possui uma correlação direta com as Peer Metrics do Global Dashboard. Exemplo: Se 'Base Ativa Target' está em queda e 'Churn Target' está em 'decline' (aumento de cancelamentos), aponte esta evasão como a principal explicação. Priorize correlações causais conhecidas (ex: CAC vs LTV, Churn vs Base, Concentração vs Risco).
3. **Recomendação**: Sugira uma ação focada no fator raiz de maior impacto.
Não mencione as palavras "Snapshot" ou "Peer Metrics" de forma robótica. Comunique-se como um par de negócios estratégico.

=== PERGUNTA DO USUÁRIO ===
{user_question}
"""
        return prompt

    async def generate_fast_insight(
        self, message: str, context_data: Dict[str, Any]
    ) -> AsyncGenerator[str, None]:
        """
        Executes the deterministic fast-path for Growth Insights with real streaming.
        """
        try:
            # 1. Surgical Snapshot Generation
            snapshot = self._create_snapshot(context_data)

            # Circuit Breaker: Validar se há contexto suficiente ANTES de chamar LLM
            if not getattr(snapshot, "is_valid_for_analysis", True):
                yield f"""### ⚠️ Precisamos de Mais Contexto

Recebi sua pergunta, mas os dados disponíveis para a métrica **{snapshot.metric_name}** estão incompletos para uma análise precisa.

| Indicador | Status |
|:---|:---|
| **Métrica selecionada** | {snapshot.metric_name} |
| **Valor Atual** | {snapshot.current_value} |
| **Variação MoM** | {snapshot.variance} |

Isso impede que minha engine estatística aponte com precisão *o que* está acontecendo e *por quê*.

**Para resolver:**
Tente ajustar os filtros de período (mês/semana) ou região para buscar uma amostra maior de dados reais."""
                return

            # 2. Prompting
            formatted_prompt = self.format_cot_prompt(snapshot, message)

            messages = [
                SystemMessage(
                    content="Você é um Parceiro Estratégico de Growth. Responda em markdown estruturado, sempre direto ao ponto."
                ),
                HumanMessage(content=formatted_prompt),
            ]

            # 3. Invocation with strict streaming
            from app.services.bedrock_client import get_bedrock_llm
            stream_llm = get_bedrock_llm(streaming=True)

            async for chunk in stream_llm.astream(messages):
                if isinstance(chunk.content, str):
                    yield chunk.content
                elif isinstance(chunk.content, list):
                    for block in chunk.content:
                        if isinstance(block, dict) and "text" in block:
                            yield block["text"]

        except Exception as e:
            logger.error(f"Erro no StatelessGrowthService: {str(e)}")
            yield "Desculpe, ocorreu um erro ao gerar o insight analítico instantâneo. Nossos modelos podem estar com instabilidade temporária."


stateless_growth_service = StatelessGrowthService()
