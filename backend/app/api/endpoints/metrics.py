from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api import deps
from app.models.metric_domain import (
    AdvancedMetricsSummaryResponse,
    ChartMetricResult,
    MetricQueryRequest,
    MetricQueryResponse,
    MetricChartData,
)
from app.db.repositories.databricks_repository import databricks_repository
from app.services.metric_insight_service import metric_insight_service
from app.services.stateless_growth_service import stateless_growth_service
from app.models.growth import GrowthIntent

router = APIRouter()


@router.get("/summary", response_model=AdvancedMetricsSummaryResponse)
async def get_advanced_metrics_summary(
    refresh: bool = False,
    db: Session = Depends(deps.get_db),
    current_user: str = Depends(deps.get_current_user_subject),
):
    """
    Fetches advanced business metrics from the Databricks repository and enriches
    them with LLM-generated insights.
    Results are cached in Redis with a finite TTL to avoid serving stale data.
    """
    from app.db.redis_client import get_cached_json, set_cached_json, delete_cached_key
    from app.core.config import settings
    import asyncio
    import logging

    logger = logging.getLogger(__name__)

    cache_key = f"metrics_summary_session_{current_user}"
    
    # FORCING REFRESH TEMP FOR MARÇO
    logger.info(f"[MetricsEndpoint] Refresh requested. Deleting cache for {current_user}")
    await delete_cached_key(cache_key)

    # 1. Fetch all metric data concurrently from the repository
    res_base, res_churn, res_omni, res_ltv, res_risk, res_wedge = await asyncio.gather(
        databricks_repository.get_base_ativa_target(),
        databricks_repository.get_churn_target(),
        databricks_repository.get_omnichannel_metrics(),
        databricks_repository.get_ltv_metrics(),
        databricks_repository.get_risk_index_target(),
        databricks_repository.get_concentration_wedge(),
    )

    metrics = []

    # --- Métrica 1: Base Ativa Target ---
    # Keys are normalised to snake_case by DatabricksRepository.get_base_ativa_target()
    val_atual_base: int = res_base.get("base_ativa", 0)
    val_ant_base: int = res_base.get("base_anterior", 0)
    val_yoy_base: int = res_base.get("base_ano_anterior", 0)
    variacao_base: float = res_base.get("variacao_mom", 0.0)
    variacao_yoy_base: float = res_base.get("variacao_yoy", 0.0)

    delta_base_str = f"{variacao_base:+.2f}%"
    delta_yoy_base_str = f"{variacao_yoy_base:+.2f}%"

    chart_data_base = {
        "labels": ["Mês Anterior", "Mês Atual"],
        "datasets": [
            {"label": "Clientes Target", "data": [val_ant_base, val_atual_base]}
        ],
    }
    chart_data_yoy_base = {
        "labels": ["Mesmo Mês (Ano Ant.)", "Mês Atual"],
        "datasets": [
            {"label": "Clientes Target", "data": [val_yoy_base, val_atual_base]}
        ],
    }

    insight_base = metric_insight_service.generate_insight_for_metric(
        "base_ativa_target",
        "Base Ativa Target",
        val_atual_base,
        val_ant_base,
        delta_base_str,
        chart_data_base,
        val_yoy_base,
        delta_yoy_base_str,
    )
    metrics.append(
        ChartMetricResult(
            id="base_ativa_target",
            title="Base Ativa Target",
            description="Clientes ativos Classe A e B (Target)",
            value=f"{val_atual_base:,}".replace(",", "."),
            previous_value=f"{val_ant_base:,}".replace(",", "."),
            change_percentage=delta_base_str,
            is_positive=variacao_base >= 0,
            is_improvement=variacao_base >= 0,
            chart_data=MetricChartData(**chart_data_base),
            previous_year_value=f"{val_yoy_base:,}".replace(",", "."),
            change_percentage_yoy=delta_yoy_base_str,
            is_positive_yoy=variacao_yoy_base >= 0,
            is_improvement_yoy=variacao_yoy_base >= 0,
            chart_data_yoy=MetricChartData(**chart_data_yoy_base),
            insight=insight_base,
        )
    )

    # --- Métrica 2: Churn Target ---
    # Keys are normalised to snake_case by DatabricksRepository.get_churn_target()
    # Note: MoM comparison unavailable; variacao_mom is always 0 for this metric
    val_atual_churn: int = res_churn.get("churn_target", 0)
    val_ant_churn: int = res_churn.get("churn_anterior", 0)
    val_yoy_churn: int = res_churn.get("churn_ano_anterior", 0)
    variacao_churn: float = res_churn.get("variacao_mom", 0.0)
    variacao_yoy_churn: float = res_churn.get("variacao_yoy", 0.0)

    delta_churn_str = f"{variacao_churn:+.2f}%"
    delta_yoy_churn_str = f"{variacao_yoy_churn:+.2f}%"

    chart_data_churn = {
        "labels": ["Mês Anterior", "Mês Atual"],
        "datasets": [
            {"label": "Churn Target", "data": [val_ant_churn, val_atual_churn]}
        ],
    }
    chart_data_yoy_churn = {
        "labels": ["Mesmo Mês (Ano Ant.)", "Mês Atual"],
        "datasets": [
            {"label": "Churn Target", "data": [val_yoy_churn, val_atual_churn]}
        ],
    }

    insight_churn = metric_insight_service.generate_insight_for_metric(
        "churn_target",
        "Churn Target",
        val_atual_churn,
        val_ant_churn,
        delta_churn_str,
        chart_data_churn,
        val_yoy_churn,
        delta_yoy_churn_str,
    )
    metrics.append(
        ChartMetricResult(
            id="churn_target",
            title="Churn Target",
            description="Clientes Target que abandonaram (MoM)",
            value=f"{val_atual_churn:,}".replace(",", "."),
            previous_value=f"{val_ant_churn:,}".replace(",", "."),
            change_percentage=delta_churn_str,
            is_positive=variacao_churn >= 0,
            is_improvement=variacao_churn <= 0,
            chart_data=MetricChartData(**chart_data_churn),
            previous_year_value=f"{val_yoy_churn:,}".replace(",", "."),
            change_percentage_yoy=delta_yoy_churn_str,
            is_positive_yoy=variacao_yoy_churn >= 0,
            is_improvement_yoy=variacao_yoy_churn <= 0,
            chart_data_yoy=MetricChartData(**chart_data_yoy_churn),
            insight=insight_churn,
        )
    )

    # --- Métrica 3: Omnichannel ---
    # Keys are normalised to snake_case by DatabricksRepository.get_omnichannel_metrics()
    val_atual_omni: int = res_omni.get("novos_atuais", 0)
    val_ant_omni: int = res_omni.get("novos_anterior", 0)
    val_yoy_omni: int = res_omni.get("novos_ano_anterior", 0)

    # Calculate Actual Variations (MTD vs Full Previous Period or same snapshot)
    def calc_pct(cur, prev):
        if not prev:
            return 0.0
        return ((cur - prev) / prev) * 100.0

    variacao_omni = calc_pct(val_atual_omni, val_ant_omni)
    variacao_yoy_omni = calc_pct(val_atual_omni, val_yoy_omni)

    delta_pct_omni_str = f"{variacao_omni:+.2f}%"
    delta_pct_yoy_omni_str = f"{variacao_yoy_omni:+.2f}%"

    # Formatting
    val_atual_omni_fmt = f"{val_atual_omni:,}".replace(",", ".")
    val_ant_omni_fmt = f"{val_ant_omni:,}".replace(",", ".")
    val_yoy_omni_fmt = f"{val_yoy_omni:,}".replace(",", ".")

    chart_data_omni = {
        "labels": ["Mês Anterior", "Mês Atual (MTD)"],
        "datasets": [
            {
                "label": "Clientes Omnichannel",
                "data": [val_ant_omni, val_atual_omni],
                "backgroundColor": "rgba(54, 162, 235, 1)",
                "borderColor": "rgba(54, 162, 235, 1)",
                "borderWidth": 1,
            }
        ],
    }

    chart_data_yoy_omni = {
        "labels": ["Mesmo Mês (Ano Ant.)", "Mês Atual (MTD)"],
        "datasets": [
            {
                "label": "Clientes Omnichannel",
                "data": [val_yoy_omni, val_atual_omni],
                "backgroundColor": "rgba(54, 162, 235, 1)",
                "borderColor": "rgba(54, 162, 235, 1)",
                "borderWidth": 1,
            }
        ],
    }

    insight_omni = metric_insight_service.generate_insight_for_metric(
        "omnichannel",
        "Omnichannel MTD",
        val_atual_omni,
        val_ant_omni,
        delta_pct_omni_str,
        chart_data_omni,
        val_yoy_omni,
        delta_pct_yoy_omni_str,
    )

    metrics.append(
        ChartMetricResult(
            id="omnichannel",
            title="Omnichannel (MTD)",
            description="Clientes únicos que compraram em múltiplos canais no mês atual",
            value=val_atual_omni_fmt,
            previous_value=val_ant_omni_fmt,
            change_percentage=delta_pct_omni_str,
            is_positive=variacao_omni >= 0,
            is_improvement=variacao_omni >= 0,
            chart_data=MetricChartData(**chart_data_omni) if chart_data_omni else None,
            previous_year_value=val_yoy_omni_fmt,
            change_percentage_yoy=delta_pct_yoy_omni_str,
            is_positive_yoy=variacao_yoy_omni >= 0,
            is_improvement_yoy=variacao_yoy_omni >= 0,
            chart_data_yoy=MetricChartData(**chart_data_yoy_omni),
            insight=insight_omni,
        )
    )

    # --- Métrica 4: LTV Médio ---
    # Keys are normalised to snake_case by DatabricksRepository.get_ltv_metrics()
    # Note: MoM comparison unavailable; variacao_mom is always 0 for this metric
    val_atual_ltv: float = res_ltv.get("avg_ltv_atual", 0)
    val_ant_ltv: float = res_ltv.get("avg_ltv_anterior", 0)
    val_yoy_ltv: float = res_ltv.get("avg_ltv_ano_anterior", 0)
    variacao_ltv: float = res_ltv.get("variacao_mom", 0.0)
    variacao_yoy_ltv: float = res_ltv.get("variacao_yoy", 0.0)

    delta_ltv_str = f"{variacao_ltv:+.2f}%"
    delta_yoy_ltv_str = f"{variacao_yoy_ltv:+.2f}%"

    chart_data_ltv = {
        "labels": ["Mês Anterior", "Mês Atual"],
        "datasets": [{"label": "LTV Médio (R$)", "data": [val_ant_ltv, val_atual_ltv]}],
    }
    chart_data_yoy_ltv = {
        "labels": ["Mesmo Mês (Ano Ant.)", "Mês Atual"],
        "datasets": [{"label": "LTV Médio (R$)", "data": [val_yoy_ltv, val_atual_ltv]}],
    }

    insight_ltv = metric_insight_service.generate_insight_for_metric(
        "ltv_metrics",
        "LTV Médio",
        val_atual_ltv,
        val_ant_ltv,
        delta_ltv_str,
        chart_data_ltv,
        val_yoy_ltv,
        delta_yoy_ltv_str,
    )
    metrics.append(
        ChartMetricResult(
            id="ltv_metrics",
            title="LTV Médio",
            description="Receita líquida acumulada por cliente",
            value=f"R$ {val_atual_ltv:,}".replace(",", "."),
            previous_value=f"R$ {val_ant_ltv:,}".replace(",", "."),
            change_percentage=delta_ltv_str,
            is_positive=variacao_ltv >= 0,
            is_improvement=variacao_ltv >= 0,
            chart_data=MetricChartData(**chart_data_ltv),
            previous_year_value=f"R$ {val_yoy_ltv:,}".replace(",", "."),
            change_percentage_yoy=delta_yoy_ltv_str,
            is_positive_yoy=variacao_yoy_ltv >= 0,
            is_improvement_yoy=variacao_yoy_ltv >= 0,
            chart_data_yoy=MetricChartData(**chart_data_yoy_ltv),
            insight=insight_ltv,
        )
    )

    # --- Métrica 5: Risk Index Target (Comentado para futuro) ---
    # val_risco = res_risk.get("clientes_em_risco", 0)
    # pct_risco = res_risk.get("percentual_risco", 0)
    #
    # chart_data_risk = {
    #     "labels": ["Mês Anterior", "Hoje"],
    #     "datasets": [
    #         {"label": "% em Risco", "data": [max(0, pct_risco - 2), pct_risco]}
    #     ],
    # }
    #
    # insight_risk = metric_insight_service.generate_insight_for_metric(
    #     "risk_target",
    #     "Target em Risco (Early Warning)",
    #     pct_risco,
    #     max(0, pct_risco - 2),
    #     f"+{pct_risco}%",
    #     chart_data_risk,
    # )
    #
    # metrics.append(
    #     ChartMetricResult(
    #         id="risk_target",
    #         title="Target em Risco",
    #         description="Clientes com compra atrasada (> 1.5x ciclo)",
    #         value=f"{pct_risco}%",
    #         previous_value=f"{val_risco:,} clientes".replace(",", "."),
    #         change_percentage="Atenção" if pct_risco > 15 else "Estável",
    #         is_positive=pct_risco <= 15,
    #         is_improvement=pct_risco <= 15,
    #         chart_data=MetricChartData(**chart_data_risk) if chart_data_risk else None,
    #         insight=insight_risk,
    #     )
    # )

    # --- Métrica 6: Concentration Wedge (Comentado para futuro) ---
    # pct_conc = res_wedge.get("concentracao_top_10_pct", 0)
    #
    # chart_data_conc = {
    #     "labels": ["Top 10%", "Restante (90%)"],
    #     "datasets": [
    #         {
    #             "label": "Faturamento",
    #             "data": [pct_conc, 100 - pct_conc],
    #             "backgroundColor": [
    #                 "rgba(59, 130, 246, 0.8)",
    #                 "rgba(229, 231, 235, 1)",
    #             ],
    #         }
    #     ],
    # }
    #
    # insight_conc = metric_insight_service.generate_insight_for_metric(
    #     "concentration_wedge",
    #     "Cunha de Concentração (Top 10%)",
    #     pct_conc,
    #     pct_conc,
    #     "Estável",
    #     chart_data_conc,
    # )
    #
    # metrics.append(
    #     ChartMetricResult(
    #         id="concentration_wedge",
    #         title="Dependência (Top 10%)",
    #         description="Faturamento do Top 10% de maiores Target",
    #         value=f"{pct_conc}%",
    #         previous_value="",
    #         change_percentage="Pareto Index",
    #         is_positive=pct_conc < 50,  # Arbitrary threshold: High concentration = bad
    #         is_improvement=pct_conc < 50,
    #         chart_data=MetricChartData(**chart_data_conc) if chart_data_conc else None,
    #         insight=insight_conc,
    #     )
    # )

    res = AdvancedMetricsSummaryResponse(metrics=metrics)

    try:
        # Use the configured TTL (default 3600 s) so stale data is never served indefinitely
        await set_cached_json(cache_key, res.model_dump(), ttl=settings.REDIS_CACHE_TTL)
    except Exception:
        pass  # Cache failure must never block the response

    return res


@router.post("/query", response_model=MetricQueryResponse)
async def query_metric(
    request: MetricQueryRequest,
    current_user: str = Depends(deps.get_current_user_subject),
):
    """
    Interrogates a specific metric's data to ask 'Why?'.
    Using session-less context to keep it fast, reliable and decoupled from Langgraph state management.
    """
    if request.intent_flag == GrowthIntent.FAST_PATH.value:
        chunks = []
        async for chunk in stateless_growth_service.generate_fast_insight(
            request.question, request.context_data
        ):
            chunks.append(chunk)
        answer = "".join(chunks)
    else:
        answer = metric_insight_service.answer_metric_query(
            request.metric_id, request.question, request.context_data
        )

    return MetricQueryResponse(answer=answer)
