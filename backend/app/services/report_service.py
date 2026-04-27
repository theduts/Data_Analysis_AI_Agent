import logging
import asyncio
from typing import TypeVar, Awaitable
from app.schemas.report import ReportResponse, MetricValue, ChartData
from app.db.repositories.databricks_repository import databricks_repository
from app.core.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Helper function to encapsulate try/except for async fetch
async def safe_fetch(coro: Awaitable[T], default_value: T, name: str) -> T:
    try:
        return await coro
    except Exception as e:
        logger.error(f"[ReportService] Error fetching {name}: {e}")
        return default_value


class ReportService:
    async def get_weekly_report(self, current_user: str, refresh: bool = False) -> ReportResponse:
        from app.db.redis_client import get_cached_json, set_cached_json, delete_cached_key

        cache_key = f"customer_profile_session_{current_user}"

        if refresh:
            logger.info(f"[ReportService] Refresh requested. Deleting cache for {current_user}")
            await delete_cached_key(cache_key)
        else:
            # Check cache if available
            cached_data = await get_cached_json(cache_key)
            if isinstance(cached_data, dict):
                logger.info(
                    f"[ReportService] Serving weekly report from session cache for {current_user}"
                )
                return ReportResponse(**cached_data)

        # 1. Fire all queries concurrently
        results = await asyncio.gather(
            safe_fetch(
                databricks_repository.get_base_ativa_target(), None, "base_ativa_target"
            ),
            safe_fetch(databricks_repository.get_churn_target(), None, "churn_target"),
            safe_fetch(databricks_repository.get_ltv_metrics(), None, "ltv_metrics"),
            safe_fetch(
                databricks_repository.get_omnichannel_metrics(),
                {},
                "omnichannel_metrics",
            ),
            safe_fetch(
                databricks_repository.get_concentration_wedge(),
                {},
                "concentration_wedge",
            ),
            safe_fetch(
                databricks_repository.get_dominant_customer_profile(), {}, "customer_profile"
            ),
            safe_fetch(
                databricks_repository.get_customer_retention(), [], "customer_retention"
            ),
            # Heatmap: fetch both channels concurrently and combine into a single payload
            safe_fetch(
                databricks_repository.get_loja_fisica_heatmap(),
                {
                    "by_estado": [],
                    "by_regiao": [],
                    "by_target_estado": [],
                    "by_target_regiao": [],
                },
                "loja_fisica_heatmap",
            ),
            safe_fetch(
                databricks_repository.get_ecomm_heatmap(),
                {
                    "by_estado": [],
                    "by_regiao": [],
                    "by_target_estado": [],
                    "by_target_regiao": [],
                },
                "ecomm_heatmap",
            ),
            safe_fetch(
                databricks_repository.get_risk_index_target(), {}, "risk_index_target"
            ),
        )

        (
            base_raw,
            churn_raw,
            ltv_raw,
            omni_raw,
            wedge_raw,
            profile_raw,
            retention_raw,
            loja_fisica_raw,
            ecomm_raw,
            risk_raw,
        ) = results

        # 2. Process metrics & create charts (synchronous CPU bound)
        total_users = None
        conversion_rate = None
        engagement = None

        # Omnichannel (MTD Comparison)
        omni = omni_raw if isinstance(omni_raw, dict) else {}
        novos_atuais = omni.get("novos_atuais") or 0
        novos_anterior = omni.get("novos_anterior") or 0
        novos_ano_anterior = omni.get("novos_ano_anterior") or 0

        if omni:
            monthly_growth = ChartData(
                labels=["Mês Atual (MTD)", "Mês Anterior", "Ano Anterior"],
                datasets=[
                    {
                        "label": "Clientes Omnichannel",
                        "data": [novos_atuais, novos_anterior, novos_ano_anterior],
                        "meta": {
                            "tooltip": "Comparativo de clientes únicos Omnichannel no período MTD"
                        },
                    }
                ],
            )
        else:
            monthly_growth = ChartData(labels=[], datasets=[])

        # Concentration Wedge (metrics_distribution)
        wedge = wedge_raw if isinstance(wedge_raw, dict) else {}
        revenue_top_10 = wedge.get("revenue_top_10") or 0
        revenue_total = wedge.get("revenue_total") or 0
        concentracao_pct = wedge.get("concentracao_top_10_pct") or 0.0

        if wedge:
            metrics_distribution = ChartData(
                labels=["Top 10%", "Demais 90%"],
                datasets=[
                    {
                        "label": "Concentração de Receita",
                        "data": [
                            revenue_top_10,
                            max(revenue_total - revenue_top_10, 0),
                        ],
                        "meta": {"concentracao_top_10_pct": concentracao_pct},
                    }
                ],
            )
        else:
            metrics_distribution = ChartData(labels=[], datasets=[])

        # Customer Profile — profile_raw is now a list of dicts from get_dominant_customer_profile(), one per cluster
        customer_profile = ChartData(
            labels=[str(p.get("cluster_atual", "")) for p in profile_raw] if isinstance(profile_raw, list) else [],
            datasets=[{"label": "dominant_profile", "data": profile_raw if isinstance(profile_raw, list) else []}],
        )

        # Customer Retention
        customer_retention = ChartData(
            labels=[
                str(r.get("ciclo_vida_granular", "Desconhecido")) for r in retention_raw
            ]
            if isinstance(retention_raw, list)
            else [],
            datasets=[{"label": "raw_data", "data": retention_raw if isinstance(retention_raw, list) else []}],
        )

        # Customer Heatmap — dual-channel payload expected by CustomerHeatmap component:
        # { loja_fisica: ChannelData, ecomm: ChannelData }
        heatmap_payload = {
            "loja_fisica": loja_fisica_raw
            or {
                "by_estado": [],
                "by_regiao": [],
                "by_target_estado": [],
                "by_target_regiao": [],
            },
            "ecomm": ecomm_raw
            or {
                "by_estado": [],
                "by_regiao": [],
                "by_target_estado": [],
                "by_target_regiao": [],
            },
        }
        customer_heatmap = ChartData(
            labels=[],
            datasets=[{"label": "raw_data", "data": [heatmap_payload]}],
        )

        # Risk Index Target
        risk = risk_raw if isinstance(risk_raw, dict) else {}
        pct_risco = risk.get("percentual_risco") or 0.0
        if risk:
            risk_index_target = MetricValue(
                value=f"{pct_risco}%",
                change="Atenção" if pct_risco > 15 else "Estável",
                is_positive=pct_risco <= 15,
            )
        else:
            risk_index_target = MetricValue(
                value="N/A", change="Indisponível", is_positive=True
            )

        response = ReportResponse(
            total_users=total_users,
            conversion_rate=conversion_rate,
            engagement=engagement,
            risk_index_target=risk_index_target,
            monthly_growth=monthly_growth,
            metrics_distribution=metrics_distribution,
            customer_profile=customer_profile,
            customer_retention=customer_retention,
            customer_heatmap=customer_heatmap,
        )

        # Cache the result with a finite TTL so stale data expires automatically
        try:
            ttl = getattr(settings, "REDIS_CACHE_TTL", 86400)
            await set_cached_json(cache_key, response.model_dump(), ttl=ttl)
            await set_cached_json(
                cache_key, response.model_dump(), ttl=settings.REDIS_CACHE_TTL
            )
        except Exception as e:
            logger.error(f"[ReportService] Error caching report: {e}")

        return response

    async def get_state_branches(
        self, state: str, channel: str, is_target: bool, current_user: str
    ):
        from app.schemas.report import StateBranchesResponse, BranchMetricItem
        from app.db.redis_client import hget_cached_json, hset_cached_json
        import logging

        cache_key = f"state_branches_session_{current_user}"
        field_key = f"{state}_{channel}_{is_target}"

        cached_data = await hget_cached_json(cache_key, field_key)
        if isinstance(cached_data, dict):
            logging.getLogger(__name__).info(
                f"[ReportService] Serving state branches from cache for {current_user}: {field_key}"
            )
            return StateBranchesResponse(**cached_data)

        branches_data = await safe_fetch(
            databricks_repository.get_branches_by_state(state, channel, is_target),
            [],
            f"state_branches_{state}",
        )

        response = StateBranchesResponse(
            state=state,
            channel=channel,
            is_target=is_target,
            branches=[BranchMetricItem(**b) for b in branches_data],
        )

        try:
            await hset_cached_json(
                cache_key, field_key, response.model_dump(), ttl=86400
            )
        except Exception as e:
            logging.getLogger(__name__).error(
                f"[ReportService] Error caching state branches: {e}"
            )

        return response


report_service = ReportService()
