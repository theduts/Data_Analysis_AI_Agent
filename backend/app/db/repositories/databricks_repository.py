import asyncio
from typing import Dict, Any, List
from app.services.databricks import databricks_connection
import logging

logger = logging.getLogger(__name__)


class DatabricksRepository:
    """
    Repository to handle all Databricks queries for Advanced Metrics, decoupling SQL from services.
    """

    def __init__(self):
        self.db = databricks_connection
        # Tabela agregada de CRM para status do cliente
        self.table_crm = "retail_db.refined.customer_lifecycle_history"
        # Tabela transacional para vendas (LTV)
        self.table_sales = "retail_db.refined.ecommerce_orders"

    async def get_base_ativa_target(self) -> Dict[str, Any]:
        """
        Base Ativa e Novos no Target (Premium + Alto Potencial + Médio Potencial) com comparação MoM e YoY.
        """
        query = """
        WITH 
bases AS (
  
  SELECT 

    COUNT(DISTINCT CASE 
      WHEN CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
        AND ciclo_vida_granular NOT IN ('Abandonador', 'Abandonador Mês')
      THEN codigo_cliente 
    END) AS base_mes_atual,
    
    COUNT(DISTINCT CASE 
      WHEN CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -1), 'yyyyMM')
        AND ciclo_vida_granular NOT IN ('Abandonador', 'Abandonador Mês')
      THEN codigo_cliente 
    END) AS base_mes_anterior,

    COUNT(DISTINCT CASE 
      WHEN CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
      AND ciclo_vida_granular NOT IN ('Abandonador', 'Abandonador Mês')
      THEN codigo_cliente
    END) AS base_ano_anterior

  FROM retail_db.refined.customer_lifecycle_history
  WHERE cluster_atual IN (
    'Premium', 'Alto Potencial', 'Médio Potencial'
    )
    AND CAST(data_partition AS STRING) IN (
      DATE_FORMAT(CURRENT_DATE(), 'yyyyMM'),
      DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -1), 'yyyyMM'),
      DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
    )
)

SELECT 
  base_mes_atual AS `Base Ativa Target - Mês Atual`,
  base_mes_anterior AS `Base Ativa Target - Mês Anterior`,
  base_ano_anterior AS `Base Ativa Target - Ano Anterior`, 
  ROUND(
    ((base_mes_atual - base_mes_anterior) * 100.0) / base_mes_anterior,
    2
  ) AS `Variação % (MoM)`,
  ROUND(
    ((base_mes_atual - base_ano_anterior) * 100.0) / base_ano_anterior,
    2
  ) AS `Variação % (YoY)`

FROM bases
        """

        response = await self.db.execute_query_async(query, "MetricRepository")

        if response.get("status") == "success" and response.get("result"):
            row = response["result"][0]
            # Normalise to snake_case keys consumed by the metric service layer
            return {
                "base_ativa": row.get("Base Ativa Target - Mês Atual", 0) or 0,
                "base_anterior": row.get("Base Ativa Target - Mês Anterior", 0) or 0,
                "base_ano_anterior": row.get("Base Ativa Target - Ano Anterior", 0)
                or 0,
                "variacao_mom": row.get("Variação % (MoM)", 0) or 0,
                "variacao_yoy": row.get("Variação % (YoY)", 0) or 0,
            }

        logger.error(
            f"Failed to fetch Base Ativa Target: {response.get('error_message')}"
        )
        return {
            "base_ativa": 0,
            "base_anterior": 0,
            "base_ano_anterior": 0,
            "variacao_mom": 0,
            "variacao_yoy": 0,
        }

    async def get_churn_target(self) -> Dict[str, Any]:
        """
        Churn Target — clientes dos clusters Premium, Alto Potencial e Médio Potencial
        cuja ciclo_vida_granular seja 'Abandonador' ou 'Abandonador Mes' no mês atual.

        Retorna MoM (mês anterior) e YoY (mesmo mês ano anterior) para comparação.
        Também retorna a base ativa do mês anterior (denominador do churn rate).
        """
        query = """
        WITH churn AS (
  SELECT 
    SUM(CASE 
      WHEN CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
      THEN Abandonador 
    END) AS churn_mes_atual,

    SUM(CASE 
      WHEN CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
      THEN Base_Ativa 
    END) AS base_mes_atual,

    SUM(CASE 
      WHEN CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -1), 'yyyyMM')
      THEN Abandonador 
    END) AS churn_mes_anterior,

    SUM(CASE 
      WHEN CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -1), 'yyyyMM')
      THEN Base_Ativa 
    END) AS base_mes_anterior,

    SUM(CASE 
      WHEN CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
      THEN Abandonador 
    END) AS churn_ano_anterior,

    SUM(CASE 
      WHEN CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
      THEN Base_Ativa 
    END) AS base_ano_anterior
    
  FROM retail_db.refined.churn_growth_enriched
  WHERE cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
    AND CAST(data_partition AS STRING) IN (
      DATE_FORMAT(CURRENT_DATE(), 'yyyyMM'),
      DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -1), 'yyyyMM'),
      DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
    )
)
SELECT 
  churn_mes_atual AS `Abandonadores Target - Mês Atual`,
  ROUND(churn_mes_atual * 100.0 / NULLIF(base_mes_atual, 0), 2) AS `Taxa Churn % - Mês Atual`,
  churn_mes_anterior AS `Abandonadores Target - Mês Anterior`,
  ROUND(churn_mes_anterior * 100.0 / NULLIF(base_mes_anterior, 0), 2) AS `Taxa Churn % - Mês Anterior`,
  churn_ano_anterior AS `Abandonadores Target - Ano Anterior`,
  ROUND(churn_ano_anterior * 100.0 / NULLIF(base_ano_anterior, 0), 2) AS `Taxa Churn % - Ano Anterior`,
  ROUND(
    ((churn_mes_atual - churn_mes_anterior) * 100.0) / NULLIF(churn_mes_anterior, 0), 2
  ) AS `Variação % (MoM)`,
  ROUND(
    ((churn_mes_atual - churn_ano_anterior) * 100.0) / NULLIF(churn_ano_anterior, 0), 2
  ) AS `Variação % (YoY)`,
  base_mes_anterior AS `Base Ativa Mês Anterior`
FROM churn
        """

        response = await self.db.execute_query_async(query, "MetricRepository")

        if response.get("status") == "success" and response.get("result"):
            row = response["result"][0]
            return {
                "churn_target": row.get("Abandonadores Target - Mês Atual", 0) or 0,
                "churn_anterior": row.get("Abandonadores Target - Mês Anterior", 0)
                or 0,
                "churn_ano_anterior": row.get("Abandonadores Target - Ano Anterior", 0)
                or 0,
                "base_ativa_mes_anterior": row.get("Base Ativa Mês Anterior", 0) or 0,
                "variacao_mom": row.get("Variação % (MoM)", 0) or 0,
                "variacao_yoy": row.get("Variação % (YoY)", 0) or 0,
                "taxa_churn_atual": row.get("Taxa Churn % - Mês Atual", 0.0) or 0.0,
            }

        logger.error(f"Failed to fetch Churn Target: {response.get('error_message')}")
        return {
            "churn_target": 0,
            "churn_anterior": 0,
            "churn_ano_anterior": 0,
            "base_ativa_mes_anterior": 0,
            "variacao_mom": 0,
            "variacao_yoy": 0,
            "taxa_churn_atual": 0.0,
        }

    async def get_omnichannel_metrics(self) -> Dict[str, Any]:
        """
        Omnichannel acumulado no mês atual (MTD) com projeção linear para o mês completo.
        Retorna campos snake_case consumidos diretamente pelo metric service layer:
          - novos_atuais       : clientes omnichannel acumulados no mês atual (MTD)
          - novos_anterior     : clientes omnichannel do mês anterior (completo)
          - novos_ano_anterior : clientes omnichannel do mesmo mês do ano anterior
          - omni_projetado     : projeção linear de novos_atuais para o mês completo
          - variacao_projetada : variação % entre omni_projetado e novos_anterior (MoM)
          - variacao_projetada_yoy : variação % entre omni_projetado e novos_ano_anterior (YoY)
          - dia_atual          : dia corrente do mês (usado para calcular projeção)
        """
        query = """
WITH omnichannel AS (
  SELECT 
    SUM(CASE 
      WHEN data_partition_fim = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
      THEN clientes_distintos 
    END) AS total_mes_atual,

    SUM(CASE 
      WHEN data_partition_fim = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -1), 'yyyyMM')
      THEN clientes_distintos 
    END) AS total_mes_anterior,

    SUM(CASE 
      WHEN data_partition_fim = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
      THEN clientes_distintos 
    END) AS total_ano_anterior,

    SUM(CASE 
      WHEN data_partition_fim = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
        AND tipo_omni = 'OMNI'
      THEN clientes_distintos 
    END) AS omni_mes_atual,

    SUM(CASE 
      WHEN data_partition_fim = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -1), 'yyyyMM')
        AND tipo_omni = 'OMNI'
      THEN clientes_distintos 
    END) AS omni_mes_anterior,

    SUM(CASE 
      WHEN data_partition_fim = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
        AND tipo_omni = 'OMNI'
      THEN clientes_distintos 
    END) AS omni_ano_anterior,

    DAY(CURRENT_DATE()) AS dia_atual
  FROM retail_db.refined.omnichannel_customers
  WHERE data_partition_fim IN (
    DATE_FORMAT(CURRENT_DATE(), 'yyyyMM'),
    DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -1), 'yyyyMM'),
    DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
  )
)

SELECT 
  omni_mes_atual AS `Omnichannel - Mês Atual`,
  ROUND((omni_mes_atual * 100.0) / NULLIF(total_mes_atual, 0), 2) AS `% Omnichannel sobre Total - Mês Atual`,
  
  omni_mes_anterior AS `Omnichannel - Mês Anterior`,
  ROUND((omni_mes_anterior * 100.0) / NULLIF(total_mes_anterior, 0), 2) AS `% Omnichannel sobre Total - Mês Anterior`,
  
  omni_ano_anterior AS `Omnichannel - Ano Anterior`,
  ROUND((omni_ano_anterior * 100.0) / NULLIF(total_ano_anterior, 0), 2) AS `% Omnichannel sobre Total - Ano Anterior`
FROM omnichannel
        """
        response = await self.db.execute_query_async(query, "MetricRepository")

        if response.get("status") == "success" and response.get("result"):
            row = response["result"][0]
            return {
                "novos_atuais": row.get("Omnichannel - Mês Atual", 0) or 0,
                "novos_anterior": row.get("Omnichannel - Mês Anterior", 0) or 0,
                "novos_ano_anterior": row.get("Omnichannel - Ano Anterior", 0) or 0,
            }

        logger.error(
            f"Failed to fetch Omnichannel metrics: {response.get('error_message')}"
        )
        return {
            "novos_atuais": 0,
            "novos_anterior": 0,
            "novos_ano_anterior": 0,
        }

    async def get_ltv_metrics(self) -> Dict[str, Any]:
        """
        LTV Médio da base — Visão Total, Target e Não Target.

        CORREÇÃO: Unifica a visão solicitada pelo board:
        - Total: Headline da RetailCo.
        - Target: Clusters estratégicos (Premium, Alto, Médio).
        - Não Target: Clusters de volume (Habitual, Ocasional, Risco).
        """
        query = """
        WITH ltv AS (
  SELECT 
    ROUND(
      SUM(CASE WHEN CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') THEN venda_liquida_12_meses END) / 
      NULLIF(COUNT(DISTINCT CASE WHEN CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') THEN codigo_cliente END), 0)
    , 2) AS ltv_mes_atual,

    ROUND(
      SUM(CASE WHEN CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -1), 'yyyyMM') THEN venda_liquida_12_meses END) / 
      NULLIF(COUNT(DISTINCT CASE WHEN CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -1), 'yyyyMM') THEN codigo_cliente END), 0)
    , 2) AS ltv_mes_anterior,

    ROUND(
      SUM(CASE WHEN CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM') THEN venda_liquida_12_meses END) / 
      NULLIF(COUNT(DISTINCT CASE WHEN CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM') THEN codigo_cliente END), 0)
    , 2) AS ltv_ano_anterior

  FROM retail_db.refined.customer_lifecycle_history
  WHERE ciclo_vida_granular NOT IN ('Abandonador', 'Abandonador Mes')
    AND CAST(data_partition AS STRING) IN (
      DATE_FORMAT(CURRENT_DATE(), 'yyyyMM'),
      DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -1), 'yyyyMM'),
      DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
    )
)

SELECT 
  ltv_mes_atual AS `LTV Médio - Mês Atual`,
  ltv_mes_anterior AS `LTV Médio - Mês Anterior`,
  ltv_ano_anterior AS `LTV Médio - Ano Anterior`,
  ROUND(
    ((ltv_mes_atual - ltv_mes_anterior) * 100.0) / NULLIF(ltv_mes_anterior, 0), 2
  ) AS `Variação % (MoM)`,
  ROUND(
    ((ltv_mes_atual - ltv_ano_anterior) * 100.0) / NULLIF(ltv_ano_anterior, 0), 2
  ) AS `Variação % (YoY)`
FROM ltv
        """
        response = await self.db.execute_query_async(query, "MetricRepository")

        if response.get("status") == "success" and response.get("result"):
            row = response["result"][0]

            return {
                "avg_ltv_atual": row.get("LTV Médio - Mês Atual", 0) or 0,
                "avg_ltv_anterior": row.get("LTV Médio - Mês Anterior", 0) or 0,
                "avg_ltv_ano_anterior": row.get("LTV Médio - Ano Anterior", 0) or 0,
                "variacao_mom": row.get("Variação % (MoM)", 0) or 0,
                "variacao_yoy": row.get("Variação % (YoY)", 0) or 0,
            }

        logger.error(f"Failed to fetch LTV metrics: {response.get('error_message')}")
        return {
            "avg_ltv_atual": 0,
            "avg_ltv_anterior": 0,
            "avg_ltv_ano_anterior": 0,
            "variacao_mom": 0,
            "variacao_yoy": 0,
        }

    async def get_risk_index_target(self) -> Dict[str, Any]:
        """
        Early Warning System: Target customers who haven't bought in 1.5x their average cycle.
        Returns the percentage and absolute number of target customers at risk.
        """
        query = """
        WITH target_ativos AS (
            SELECT
                codigo_cliente,
                ultima_compra,
                -- Mocking cycle time based on available data limits (assuming 60 days average cycle for high-end retail if not physically recorded)
                -- In a real scenario, this would be `ciclo_de_recompra_dias`
                60 AS ciclo_medio_estimado
            FROM retail_db.refined.customer_lifecycle_history
            WHERE poder_de_compra_cliente IN ('Classe A', 'Classe B')
              AND ciclo_vida_granular ILIKE '%ativo%'
              AND data_partition = CAST(DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS BIGINT)
        ),
        risk_calc AS (
            SELECT
                codigo_cliente,
                DATEDIFF(CURRENT_DATE(), ultima_compra) as dias_sem_comprar,
                ciclo_medio_estimado,
                CASE
                    WHEN DATEDIFF(CURRENT_DATE(), ultima_compra) > (ciclo_medio_estimado * 1.5) THEN 1
                    ELSE 0
                END as is_at_risk
            FROM target_ativos
        )
        SELECT
            COUNT(*) as total_ativos_target,
            SUM(is_at_risk) as clientes_em_risco,
            ROUND((SUM(is_at_risk) * 100.0) / COUNT(*), 2) as percentual_risco
        FROM risk_calc
        """
        response = await self.db.execute_query_async(query, "MetricRepository")

        if response.get("status") == "success" and response.get("result"):
            return response["result"][0]

        logger.error(
            f"Failed to fetch Risk Index Target: {response.get('error_message')}"
        )
        return {"total_ativos_target": 0, "clientes_em_risco": 0, "percentual_risco": 0}

    async def get_concentration_wedge(self) -> Dict[str, Any]:
        """
        Concentration Wedge: What percentage of total target revenue comes from the top 10% of target customers.
        """
        query = """
        WITH ranked_customers AS (
            SELECT
                codigo_cliente,
                venda_liquida as receita,
                PERCENT_RANK() OVER (ORDER BY venda_liquida DESC) as pct_rank
            FROM retail_db.refined.customer_lifecycle_history
            WHERE poder_de_compra_cliente IN ('Classe A', 'Classe B')
              AND data_partition = CAST(DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS BIGINT)
              AND venda_liquida_total > 0
        ),
        top_10 AS (
            SELECT SUM(receita) as revenue_top_10 FROM ranked_customers WHERE pct_rank <= 0.1
        ),
        total AS (
            SELECT SUM(receita) as revenue_total FROM ranked_customers
        )
        SELECT
            t.revenue_top_10,
            t2.revenue_total,
            ROUND((t.revenue_top_10 * 100.0) / t2.revenue_total, 2) as concentracao_top_10_pct
        FROM top_10 t CROSS JOIN total t2
        order by t.revenue_top_10 desc
        """
        response = await self.db.execute_query_async(query, "MetricRepository")

        if response.get("status") == "success" and response.get("result"):
            return response["result"][0]

        logger.error(
            f"Failed to fetch Concentration Wedge: {response.get('error_message')}"
        )
        return {"revenue_top_10": 0, "revenue_total": 0, "concentracao_top_10_pct": 0}

    async def get_dominant_customer_profile(self) -> List[Dict[str, Any]]:
        """
        Dominant customer profile per cluster for the current month.

        Returns a list of dicts (one per cluster):
          - cluster_atual
          - poder_de_compra_cliente
          - genero_cliente
          - faixa_etaria
          - ticket_medio
          - total_clientes
          - percentual_da_base
        """
        query = """
-- Perfil da semana por cluster 
WITH clientes_semana AS (
  SELECT 
    cluster_atual,
    poder_de_compra_cliente,
    genero_cliente,
    CASE 
      WHEN idade_atual_cliente < 18 THEN 'Menor de 18'
      WHEN idade_atual_cliente < 25 THEN '18-24'
      WHEN idade_atual_cliente < 35 THEN '25-34'
      WHEN idade_atual_cliente < 45 THEN '35-44'
      WHEN idade_atual_cliente < 55 THEN '45-54'
      WHEN idade_atual_cliente < 65 THEN '55-64'
      WHEN idade_atual_cliente < 75 THEN '65-74'
      ELSE '75+'
    END AS faixa_etaria,
    codigo_cliente,
    venda_liquida_12_meses,
    tickets_12_meses
  FROM retail_db.refined.customer_lifecycle_history
  WHERE data_partition = CAST(DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS BIGINT)
    AND poder_de_compra_cliente != 'NAO INFORMADO'
    AND cidade_cliente != 'NAO INFORMADO'
    AND genero_cliente != 'NAO INFORMADO'
    AND cluster_atual IN ('Premium', 'Médio Potencial', 'Alto Potencial', 'Ocasional', 'Ocasional Risco', 'Habitual')
),

perfil_ranking AS (
  SELECT 
    cluster_atual,
    poder_de_compra_cliente,
    genero_cliente,
    faixa_etaria,
    COUNT(DISTINCT codigo_cliente) AS total_clientes,
    ROW_NUMBER() OVER (PARTITION BY cluster_atual ORDER BY COUNT(DISTINCT codigo_cliente) DESC) AS rn
  FROM clientes_semana
  GROUP BY cluster_atual, poder_de_compra_cliente, genero_cliente, faixa_etaria
),

top_perfil AS (
  SELECT cluster_atual, poder_de_compra_cliente, genero_cliente, faixa_etaria, total_clientes
  FROM perfil_ranking
  WHERE rn = 1
),

clientes_top_perfil AS (
  SELECT DISTINCT cs.codigo_cliente, cs.cluster_atual
  FROM clientes_semana cs
  INNER JOIN top_perfil tp
    ON cs.cluster_atual = tp.cluster_atual
    AND cs.poder_de_compra_cliente = tp.poder_de_compra_cliente
    AND cs.genero_cliente = tp.genero_cliente
    AND cs.faixa_etaria = tp.faixa_etaria
),

ticket_medio_perfil AS (
  SELECT 
    cs.cluster_atual,
    ROUND(SUM(cs.venda_liquida_12_meses) / NULLIF(SUM(cs.tickets_12_meses), 0), 2) AS ticket_medio
  FROM clientes_semana cs
  INNER JOIN top_perfil tp
    ON cs.cluster_atual = tp.cluster_atual
    AND cs.poder_de_compra_cliente = tp.poder_de_compra_cliente
    AND cs.genero_cliente = tp.genero_cliente
    AND cs.faixa_etaria = tp.faixa_etaria
  GROUP BY cs.cluster_atual
),

vendas_perfil AS (
  SELECT 
    ctp.cluster_atual,
    SUM(v.quantidade_liquida) AS total_pecas_vendidas,
    COUNT(DISTINCT v.numero_ticket) AS total_atendimentos,
    COUNT(DISTINCT v.codigo_cliente_venda) AS clientes_que_compraram
  FROM clientes_top_perfil ctp
  LEFT JOIN retail_db.refined.store_sales_products v
    ON v.codigo_cliente_venda = ctp.codigo_cliente
    AND v.data_partition = CAST(DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS INT)
  GROUP BY ctp.cluster_atual
)

SELECT 
  tp.cluster_atual,
  tp.poder_de_compra_cliente,
  tp.genero_cliente,
  tp.faixa_etaria,
  tp.total_clientes,
  COALESCE(vp.clientes_que_compraram, 0) AS clientes_que_compraram,
  ROUND(COALESCE(vp.clientes_que_compraram, 0) * 100.0 / tp.total_clientes, 2) AS pct_compraram,
  tm.ticket_medio,
  COALESCE(vp.total_pecas_vendidas, 0) AS total_pecas_vendidas,
  COALESCE(vp.total_atendimentos, 0) AS total_atendimentos,
  ROUND(COALESCE(vp.total_pecas_vendidas, 0) * 1.0 / NULLIF(vp.total_atendimentos, 0), 2) AS peca_por_atendimento
FROM top_perfil tp
LEFT JOIN vendas_perfil vp ON tp.cluster_atual = vp.cluster_atual
LEFT JOIN ticket_medio_perfil tm ON tp.cluster_atual = tm.cluster_atual
ORDER BY tp.cluster_atual
        """
        response = await self.db.execute_query_async(query, "MetricRepository")

        if response.get("status") == "success" and response.get("result"):
            return response["result"]

        logger.error(
            f"Failed to fetch Dominant Customer Profile: {response.get('error_message')}"
        )
        return []

    async def get_customer_retention(self) -> List[Dict[str, Any]]:
        """
        Distribuição percentual de cada ciclo de vida granular (clientes da semana atual).
        """
        query = """
        WITH base_semana AS (
          SELECT
            ciclo_vida_granular,
            COUNT(DISTINCT codigo_cliente) AS total_clientes
          FROM retail_db.refined.customer_lifecycle_history
          WHERE DATE_FORMAT(ultima_compra, 'yyyyMM') = DATE_FORMAT(CURRENT_DATE, 'yyyyMM')
          GROUP BY ciclo_vida_granular
        ),
        total AS (
          SELECT SUM(total_clientes) AS total_geral
          FROM base_semana
        )
        SELECT
          ciclo_vida_granular,
          total_clientes,
          ROUND((total_clientes * 100.0) / total_geral, 2) AS percentual
        FROM base_semana, total
        ORDER BY total_clientes DESC
        """
        response = await self.db.execute_query_async(query, "MetricRepository")

        if response.get("status") == "success" and response.get("result"):
            return response["result"]

        logger.error(
            f"Failed to fetch Customer Retention: {response.get('error_message')}"
        )
        return []

    # ------------------------------------------------------------------ #
    #  Heatmap — Loja Física                                              #
    # ------------------------------------------------------------------ #

    async def get_loja_fisica_heatmap(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        Geographic distribution of physical-store customers for the current month.
        Source table: AnalyticsAgent_vendas_produtos_clientes_filial
        Yields four parallel result sets:
          - by_estado        : total unique customers by store state
          - by_regiao        : total unique customers by store region
          - by_target_estado : Premium / Alto / Médio Potencial customers by store state + branch
          - by_target_regiao : Premium / Alto / Médio Potencial customers by store region
        """
        # 1. Total de clientes por estado da filial ─────────────────────
        q_estado = """
      WITH clientes_mes AS (
        SELECT
          estado_filial,
          COUNT(DISTINCT codigo_cliente_venda) AS total_clientes
        FROM retail_db.refined.store_sales_products
        WHERE DATE_FORMAT(data_venda, 'yyyyMM') = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
        GROUP BY estado_filial
      ),
      total AS (
        SELECT SUM(total_clientes) AS total_geral
        FROM clientes_mes
      )
      SELECT
        estado_filial AS estado,
        total_clientes,
        ROUND((total_clientes * 100.0) / total_geral, 2) AS percentual
      FROM clientes_mes, total
      ORDER BY total_clientes DESC
        """

        # 2. Total de clientes por região da filial ──────────────────────
        q_regiao = """
        WITH clientes_mes AS (
          SELECT
            regiao_filial,
            COUNT(DISTINCT codigo_cliente_venda) AS total_clientes
          FROM retail_db.refined.store_sales_products
          WHERE DATE_FORMAT(data_venda, 'yyyyMM') = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
          GROUP BY regiao_filial
        ),
        total AS (
          SELECT SUM(total_clientes) AS total_geral
          FROM clientes_mes
        )
        SELECT
          regiao_filial AS regiao,
          total_clientes,
          ROUND((total_clientes * 100.0) / total_geral, 2) AS percentual
        FROM clientes_mes, total
        ORDER BY total_clientes DESC
        """

        # 3. Clientes Target por estado + filial ─────────────────────────
        q_target_estado = """
          WITH clientes_target AS (
            SELECT
              v.estado_filial AS estado,
              v.nome_filial AS filial,
              COUNT(DISTINCT v.codigo_cliente_venda) AS total_clientes
            FROM retail_db.refined.store_sales_products v
            JOIN retail_db.refined.customer_lifecycle_history c
              ON v.codigo_cliente_venda = c.codigo_cliente
              AND c.data_partition = CAST(DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS BIGINT)
            WHERE DATE_FORMAT(v.data_venda, 'yyyyMM') = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
              AND c.cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
            GROUP BY v.estado_filial, v.nome_filial
          ),
          total AS (
            SELECT SUM(total_clientes) AS total_geral
            FROM clientes_target
          )
          SELECT
            estado,
            filial,
            total_clientes,
            ROUND((total_clientes * 100.0) / total_geral, 2) AS percentual
          FROM clientes_target, total
          ORDER BY total_clientes DESC
        """

        # 4. Clientes Target por região da filial ────────────────────────
        q_target_regiao = """
          WITH clientes_target AS (
        SELECT
          v.regiao_filial,
          COUNT(DISTINCT v.codigo_cliente_venda) AS total_clientes
        FROM retail_db.refined.store_sales_products v
        JOIN retail_db.refined.customer_lifecycle_history c
          ON v.codigo_cliente_venda = c.codigo_cliente
          AND c.data_partition = CAST(DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS BIGINT)
        WHERE DATE_FORMAT(v.data_venda, 'yyyyMM') = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
          AND c.cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
        GROUP BY v.regiao_filial
      ),
      total AS (
        SELECT SUM(total_clientes) AS total_geral
        FROM clientes_target
      )
      SELECT
        regiao_filial AS regiao,
        total_clientes,
        ROUND((total_clientes * 100.0) / total_geral, 2) AS percentual
      FROM clientes_target, total
      order by total_clientes desc
        """

        (
            res_estado,
            res_regiao,
            res_target_estado,
            res_target_regiao,
        ) = await asyncio.gather(
            self.db.execute_query_async(q_estado, "HeatmapRepository"),
            self.db.execute_query_async(q_regiao, "HeatmapRepository"),
            self.db.execute_query_async(q_target_estado, "HeatmapRepository"),
            self.db.execute_query_async(q_target_regiao, "HeatmapRepository"),
        )

        def _rows(res: Dict[str, Any]) -> List[Dict[str, Any]]:
            if res.get("status") != "success":
                logger.error(
                    f"Loja Fisica heatmap query FAILED: {res.get('error_message', '(no detail)')}"
                )
                return []
            rows = res.get("result", [])
            logger.info(f"Loja Fisica heatmap query OK: {len(rows)} rows")
            return rows

        result = {
            "by_estado": _rows(res_estado),
            "by_regiao": _rows(res_regiao),
            "by_target_estado": _rows(res_target_estado),
            "by_target_regiao": _rows(res_target_regiao),
        }

        if not any(result.values()):
            logger.error("Loja Física heatmap: all queries returned empty or failed")

        return result

    # ------------------------------------------------------------------ #
    #  Heatmap — Ecomm                                                   #
    # ------------------------------------------------------------------ #

    async def get_ecomm_heatmap(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        Geographic distribution of e-commerce customers for the current month.
        Source table: AnalyticsAgent_ecomm_completo
        Yields four parallel result sets:
          - by_estado        : total unique customers by customer state (UF)
          - by_regiao        : total unique customers by customer region
          - by_target_estado : Premium / Alto / Médio Potencial customers by customer state
          - by_target_regiao : Premium / Alto / Médio Potencial customers by customer region
        """
        _region_case = """
          CASE
            WHEN unidade_federal IN ('AC','AM','AP','PA','RO','RR','TO') THEN 'Norte'
            WHEN unidade_federal IN ('AL','BA','CE','MA','PB','PE','PI','RN','SE') THEN 'Nordeste'
            WHEN unidade_federal IN ('DF','GO','MS','MT') THEN 'Centro-Oeste'
            WHEN unidade_federal IN ('ES','MG','RJ','SP') THEN 'Sudeste'
            WHEN unidade_federal IN ('PR','RS','SC') THEN 'Sul'
            ELSE 'Não Informado'
          END
        """

        # 1. Total de clientes por estado do cliente ─────────────────────
        q_estado = """
        WITH clientes_mes AS (
          SELECT
            unidade_federal AS estado_cliente,
            COUNT(DISTINCT codigo_cliente) AS total_clientes
          FROM retail_db.refined.ecommerce_orders
          WHERE DATE_FORMAT(data_pedido, 'yyyyMM') = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
          GROUP BY unidade_federal
        ),
        total AS (
          SELECT SUM(total_clientes) AS total_geral
          FROM clientes_mes
        )
        SELECT
          estado_cliente,
          total_clientes,
          ROUND((total_clientes * 100.0) / total_geral, 2) AS percentual
        FROM clientes_mes, total
        order by total_clientes desc
        """

        # 2. Total de clientes por região do cliente ──────────────────────
        q_regiao = f"""
        WITH clientes_mes AS (
          SELECT 
            {_region_case} AS regiao,
            COUNT(DISTINCT codigo_cliente) AS total_clientes
          FROM retail_db.refined.ecommerce_orders
          WHERE DATE_FORMAT(data_pedido, 'yyyyMM') = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
          GROUP BY regiao
        ),
        total AS (
          SELECT SUM(total_clientes) AS total_geral 
          FROM clientes_mes
        )
        SELECT 
          regiao, 
          total_clientes, 
          ROUND((total_clientes * 100.0) / total_geral, 2) AS percentual
        FROM clientes_mes, total
        order by total_clientes desc
        """

        # 3. Clientes Target por estado do cliente ───────────────────────
        q_target_estado = """
        WITH clientes_target AS (
          SELECT
            e.unidade_federal AS estado_cliente,
            COUNT(DISTINCT e.codigo_cliente) AS total_clientes
          FROM retail_db.refined.ecommerce_orders e
          JOIN retail_db.refined.customer_lifecycle_history c
            ON e.codigo_cliente = c.codigo_cliente
            AND c.data_partition = CAST(DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS BIGINT)
          WHERE DATE_FORMAT(e.data_pedido, 'yyyyMM') = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
            AND c.cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
          GROUP BY e.unidade_federal
        ),
        total AS (
          SELECT SUM(total_clientes) AS total_geral
          FROM clientes_target
        )
        SELECT
          estado_cliente,
          total_clientes,
          ROUND((total_clientes * 100.0) / total_geral, 2) AS percentual
        FROM clientes_target, total
        ORDER BY total_clientes DESC
        """

        # 4. Clientes Target por região do cliente ────────────────────────
        q_target_regiao = """
        WITH clientes_mes AS (
          SELECT
            CASE
              WHEN e.unidade_federal IN ('AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO') THEN 'Norte'
              WHEN e.unidade_federal IN ('AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE') THEN 'Nordeste'
              WHEN e.unidade_federal IN ('DF', 'GO', 'MS', 'MT') THEN 'Centro-Oeste'
              WHEN e.unidade_federal IN ('ES', 'MG', 'RJ', 'SP') THEN 'Sudeste'
              WHEN e.unidade_federal IN ('PR', 'RS', 'SC') THEN 'Sul'
              ELSE 'Não Informado'
            END AS regiao,
            COUNT(DISTINCT e.codigo_cliente) AS total_clientes
          FROM retail_db.refined.ecommerce_orders e
          JOIN retail_db.refined.customer_lifecycle_history c
            ON c.codigo_cliente = e.codigo_cliente
            AND c.data_partition = CAST(DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS BIGINT)
          WHERE DATE_FORMAT(e.data_pedido, 'yyyyMM') = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
            AND c.cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
          GROUP BY regiao
        ),
        total AS (
          SELECT SUM(total_clientes) AS total_geral
          FROM clientes_mes
        )
        SELECT
          regiao,
          total_clientes,
          ROUND((total_clientes * 100.0) / total_geral, 2) AS percentual
        FROM clientes_mes, total
        ORDER BY total_clientes DESC
        """

        (
            res_estado,
            res_regiao,
            res_target_estado,
            res_target_regiao,
        ) = await asyncio.gather(
            self.db.execute_query_async(q_estado, "HeatmapRepository"),
            self.db.execute_query_async(q_regiao, "HeatmapRepository"),
            self.db.execute_query_async(q_target_estado, "HeatmapRepository"),
            self.db.execute_query_async(q_target_regiao, "HeatmapRepository"),
        )

        def _rows(res: Dict[str, Any]) -> List[Dict[str, Any]]:
            return res.get("result", []) if res.get("status") == "success" else []

        result = {
            "by_estado": _rows(res_estado),
            "by_regiao": _rows(res_regiao),
            "by_target_estado": _rows(res_target_estado),
            "by_target_regiao": _rows(res_target_regiao),
        }

        if not any(result.values()):
            logger.error("Ecomm heatmap: all queries returned empty or failed")

        return result

    async def get_branches_by_state(
        self, state: str, channel: str, is_target: bool
    ) -> List[Dict[str, Any]]:
        """
        Returns the ordered list of branches for a given state,
        filtered by channel and target cluster.
        """
        if channel == "ecomm":
            return []  # Ecomm does not have branches

        # Optional: mapping from Sigla to Estado nome if frontend sends sigla
        # Here we assume the frontend sends the sigla if `resolveUF` is what was mapped
        if is_target:
            query = f"""
            WITH clientes_target AS (
              SELECT
                v.nome_filial AS filial,
                COUNT(DISTINCT v.codigo_cliente_venda) AS total_clientes
              FROM retail_db.refined.store_sales_products v
              JOIN retail_db.refined.customer_lifecycle_history c
                ON v.codigo_cliente_venda = c.codigo_cliente
                AND c.data_partition = CAST(DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS BIGINT)
              WHERE DATE_FORMAT(v.data_venda, 'yyyyMM') = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
                AND c.cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
                AND v.estado_filial = '{state}'
              GROUP BY v.nome_filial
            ),
            total AS (
              SELECT SUM(total_clientes) AS total_geral
              FROM clientes_target
            )
            SELECT

              filial,
              total_clientes,
              ROUND((total_clientes * 100.0) / total_geral, 2) AS percentual
            FROM clientes_target, total
            ORDER BY total_clientes DESC
            """
        else:
            query = f"""
            WITH clientes_mes AS (
              SELECT
                nome_filial AS filial,
                COUNT(DISTINCT codigo_cliente_venda) AS total_clientes
              FROM retail_db.refined.store_sales_products
              WHERE DATE_FORMAT(data_venda, 'yyyyMM') = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
                AND estado_filial = '{state}'
              GROUP BY nome_filial
            ),
            total AS (
              SELECT SUM(total_clientes) AS total_geral
              FROM clientes_mes
            )
            SELECT

              filial,
              total_clientes,
              ROUND((total_clientes * 100.0) / total_geral, 2) AS percentual
            FROM clientes_mes, total
            ORDER BY total_clientes DESC
            """

        response = await self.db.execute_query_async(query, "HeatmapRepository")

        if response.get("status") == "success" and response.get("result"):
            return response["result"]

        logger.error(
            f"Failed to fetch branches for state {state}: {response.get('error_message')}"
        )
        return []

    # ─────────────────────────────────────────────────────────────────────────
    # Executive Presentation — Deep-Dive & Shift-Left Projection Methods
    # ─────────────────────────────────────────────────────────────────────────

    async def get_base_ativa_deep_dive(self) -> List[Dict[str, Any]]:
        """
        Base Ativa no Target — granular breakdown by cluster × region × channel.

        Returns one row per (cluster, regiao, canal) combination with:
          - base_atual: active customers MTD
          - base_ly: active customers same month last year
          - variacao_yoy_pct: YoY % change
          - is_positive: boolean — true if YoY is >= 0

        This powers the "Pontos Positivos" and "Gaps e Oportunidades" slides.
        The agent uses is_positive to sort results into positive vs. gap cards.
        """
        query = """
        WITH base AS (
          SELECT
            cluster_atual,
            CASE 
              WHEN estado_cliente IN ('AC','AM','AP','PA','RO','RR','TO') THEN 'Norte'
              WHEN estado_cliente IN ('AL','BA','CE','MA','PB','PE','PI','RN','SE') THEN 'Nordeste'
              WHEN estado_cliente IN ('DF','GO','MS','MT') THEN 'Centro-Oeste'
              WHEN estado_cliente IN ('ES','MG','RJ','SP') THEN 'Sudeste'
              WHEN estado_cliente IN ('PR','RS','SC') THEN 'Sul'
              ELSE 'NAO INFORMADO'
            END AS regiao,
            COALESCE(descricao_canal_produto, 'NAO INFORMADO') AS canal,

            COUNT(DISTINCT CASE
              WHEN CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
                AND (ciclo_vida_granular ILIKE 'ativo%'
                  OR ciclo_vida_granular ILIKE '%recuperado%'
                  OR ciclo_vida_granular ILIKE '%novo%')
              THEN codigo_cliente END) AS base_atual,

            COUNT(DISTINCT CASE
              WHEN CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
                AND (ciclo_vida_granular ILIKE 'ativo%'
                  OR ciclo_vida_granular ILIKE '%recuperado%'
                  OR ciclo_vida_granular ILIKE '%novo%')
              THEN codigo_cliente END) AS base_ly

          FROM retail_db.refined.customer_lifecycle_history
          WHERE cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial', 'Oportunidade')
            AND CAST(data_partition AS STRING) IN (
              DATE_FORMAT(CURRENT_DATE(), 'yyyyMM'),
              DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
            )
          GROUP BY cluster_atual, regiao, descricao_canal_produto
        )
        SELECT
          cluster_atual,
          regiao,
          canal,
          base_atual,
          base_ly,
          ROUND(
            ((base_atual - base_ly) * 100.0) / NULLIF(base_ly, 0), 1
          ) AS variacao_yoy_pct,
          CASE WHEN base_atual >= base_ly THEN TRUE ELSE FALSE END AS is_positive
        FROM base
        WHERE base_atual > 0 OR base_ly > 0
        ORDER BY cluster_atual, variacao_yoy_pct DESC
        """
        response = await self.db.execute_query_async(query, "MetricRepository")

        if response.get("status") == "success" and response.get("result"):
            return response["result"]

        logger.error(
            f"Failed to fetch Base Ativa Deep Dive: {response.get('error_message')}"
        )
        return []

    async def get_base_ativa_with_projection(self) -> Dict[str, Any]:
        """
        Base Ativa no Target — MTD realizado + Shift-Left linear projection.

        All math is done in SQL (Shift-Left principle) to guarantee consistency
        with PowerBI/Tableau dashboards and avoid LLM arithmetic hallucinations.

        Returns:
          - Per cluster: realizado, meta (from OKR), atingimento_pct, variacao_ly
          - Aggregated total: total_realizado, total_meta, total_atingimento_pct
          - Projection: total_projetado (linear extrapolation to end of month)
          - variacao_ly_total
        """
        query = """
        WITH
        dia_info AS (
          SELECT
            DAY(CURRENT_DATE()) AS dia_atual,
            DAY(LAST_DAY(CURRENT_DATE())) AS dias_no_mes
        ),
        por_cluster AS (
          SELECT
            cluster_atual,
            COUNT(DISTINCT CASE
              WHEN CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
                AND (ciclo_vida_granular ILIKE 'ativo%'
                  OR ciclo_vida_granular ILIKE '%recuperado%'
                  OR ciclo_vida_granular ILIKE '%novo%')
              THEN codigo_cliente END) AS realizado,

            COUNT(DISTINCT CASE
              WHEN CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -1), 'yyyyMM')
                AND (ciclo_vida_granular ILIKE 'ativo%'
                  OR ciclo_vida_granular ILIKE '%recuperado%'
                  OR ciclo_vida_granular ILIKE '%novo%')
              THEN codigo_cliente END) AS realizado_mes_anterior,

            COUNT(DISTINCT CASE
              WHEN CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
                AND (ciclo_vida_granular ILIKE 'ativo%'
                  OR ciclo_vida_granular ILIKE '%recuperado%'
                  OR ciclo_vida_granular ILIKE '%novo%')
              THEN codigo_cliente END) AS realizado_ly

          FROM retail_db.refined.customer_lifecycle_history
          WHERE cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
            AND CAST(data_partition AS STRING) IN (
              DATE_FORMAT(CURRENT_DATE(), 'yyyyMM'),
              DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -1), 'yyyyMM'),
              DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
            )
          GROUP BY cluster_atual
        ),
        okrs AS (
          SELECT OKR, valor
          FROM retail_db.refined.okrs_current_year
          WHERE LOWER(OKR) LIKE '%base ativa%'
            AND data_referencia = DATE_FORMAT(CURRENT_DATE(), 'yyyy-MM-01')
        ),
        com_meta AS (
          SELECT
            pc.cluster_atual,
            pc.realizado,
            pc.realizado_mes_anterior,
            pc.realizado_ly,
            CAST(o.valor AS INT) AS meta,
            ROUND((pc.realizado * 100.0) / NULLIF(CAST(o.valor AS INT), 0)) AS atingimento_pct,
            ROUND(((pc.realizado - pc.realizado_ly) * 100.0) / NULLIF(pc.realizado_ly, 0)) AS variacao_ly_pct
          FROM por_cluster pc
          LEFT JOIN okrs o ON LOWER(o.OKR) LIKE CONCAT('%base ativa%', LOWER(pc.cluster_atual), '%')
        ),
        totais AS (
          SELECT
            SUM(realizado) AS total_realizado,
            SUM(realizado_mes_anterior) AS total_mes_anterior,
            SUM(realizado_ly) AS total_ly,
            SUM(meta) AS total_meta
          FROM com_meta
        ),
        projecao AS (
          SELECT
            d.dia_atual,
            d.dias_no_mes,
            t.total_realizado,
            t.total_mes_anterior,
            t.total_ly,
            t.total_meta,
            ROUND((t.total_realizado * 1.0 / NULLIF(d.dia_atual, 0)) * d.dias_no_mes) AS total_projetado,
            ROUND((t.total_realizado * 100.0) / NULLIF(t.total_meta, 0)) AS total_atingimento_pct,
            ROUND(((t.total_realizado - t.total_ly) * 100.0) / NULLIF(t.total_ly, 0)) AS variacao_ly_total
          FROM totais t CROSS JOIN dia_info d
        )
        SELECT
          (SELECT COLLECT_LIST(
            NAMED_STRUCT(
              'cluster', cluster_atual,
              'realizado', realizado,
              'meta', meta,
              'atingimento_pct', atingimento_pct,
              'variacao_ly_pct', variacao_ly_pct,
              'realizado_mes_anterior', realizado_mes_anterior
            )
          ) FROM com_meta) AS clusters,
          p.dia_atual,
          p.dias_no_mes,
          p.total_realizado,
          p.total_mes_anterior,
          p.total_ly,
          p.total_meta,
          p.total_projetado,
          p.total_atingimento_pct,
          p.variacao_ly_total
        FROM projecao p
        """
        response = await self.db.execute_query_async(query, "MetricRepository")

        if response.get("status") == "success" and response.get("result"):
            return response["result"][0]

        logger.error(
            f"Failed to fetch Base Ativa Projection: {response.get('error_message')}"
        )
        return {
            "clusters": [],
            "dia_atual": 1,
            "dias_no_mes": 30,
            "total_realizado": 0,
            "total_mes_anterior": 0,
            "total_ly": 0,
            "total_meta": 0,
            "total_projetado": 0,
            "total_atingimento_pct": 0,
            "variacao_ly_total": 0,
        }

    async def get_acquisition_deep_dive(self) -> Dict[str, Any]:
        """
        Análise Profunda de Aquisição (Cohort e Canais).
        """
        query = """
        WITH novos AS (
          SELECT
            codigo_cliente,
            CAST(data_partition AS STRING) AS safra,
            COALESCE(descricao_canal_produto, 'NAO INFORMADO') AS canal_entrada
          FROM retail_db.refined.customer_lifecycle_history
          WHERE (ciclo_vida_granular ILIKE '%novo%' OR ciclo_vida_granular ILIKE '%primeira_compra%')
            AND CAST(data_partition AS STRING) IN (
              DATE_FORMAT(CURRENT_DATE(), 'yyyyMM'),
              DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
            )
        )
        SELECT
          (SELECT COUNT(DISTINCT codigo_cliente) FROM novos WHERE safra = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')) as safra_atual,
          (SELECT COUNT(DISTINCT codigo_cliente) FROM novos WHERE safra = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')) as safra_ly,
          (SELECT COLLECT_LIST(NAMED_STRUCT('canal', canal_entrada, 'volume', vol))
           FROM (SELECT canal_entrada, COUNT(*) as vol FROM novos WHERE safra = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') GROUP BY 1 ORDER BY 2 DESC LIMIT 3)) as top_canais
        """
        response = await self.db.execute_query_async(query, "MetricRepository")
        return (
            response.get("result", [{}])[0]
            if response.get("status") == "success"
            else {}
        )

    async def get_churn_deep_dive(self) -> Dict[str, Any]:
        """
        Padrões comportamentais pré-churn.
        """
        query = """
        SELECT
          ciclo_vida_granular,
          ROUND(AVG(DATEDIFF(CURRENT_DATE(), ultima_compra)), 0) AS avg_recencia_dias,
          ROUND(AVG(tickets_12_meses), 1) AS avg_frequencia_anual
        FROM retail_db.refined.customer_lifecycle_history
        WHERE (ciclo_vida_granular IN ('Abandonador', 'Abandonador Mes')
           OR ciclo_vida_granular ILIKE 'ativo%')
          AND CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
          AND cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
        GROUP BY 1
        """
        response = await self.db.execute_query_async(query, "MetricRepository")
        return (
            {"patterns": response.get("result", [])}
            if response.get("status") == "success"
            else {"patterns": []}
        )

    async def get_channel_performance_metrics(self) -> Dict[str, Any]:
        """
        Drill-down de LTV e Volume por Canal/Cluster.
        """
        query = """
        SELECT
          COALESCE(descricao_canal_produto, 'NAO INFORMADO') AS canal,
          cluster_atual,
          COUNT(DISTINCT codigo_cliente) AS volume,
          ROUND(AVG(venda_liquida_12_meses), 2) AS ltv_medio
        FROM retail_db.refined.customer_lifecycle_history
        WHERE CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
          AND cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
        GROUP BY 1, 2
        ORDER BY 1, 4 DESC
        """
        response = await self.db.execute_query_async(query, "MetricRepository")
        return (
            {"channels": response.get("result", [])}
            if response.get("status") == "success"
            else {"channels": []}
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Growth Domain Services — Infrastructure Layer (New Queries)
    # ─────────────────────────────────────────────────────────────────────────

    async def get_look_alike_heuristic(self) -> Dict[str, Any]:
        """
        Look-Alike Heurístico: Profile of Top 10% Classe A customers.

        Returns the dominant demographic profile (gender + age + region)
        and first-purchase categories for deterministic lead matching.
        """
        query = """
        WITH classe_a AS (
          SELECT
            codigo_cliente,
            genero_cliente,
            CASE
              WHEN idade_atual_cliente < 25 THEN '18-24'
              WHEN idade_atual_cliente < 35 THEN '25-34'
              WHEN idade_atual_cliente < 45 THEN '35-44'
              WHEN idade_atual_cliente < 55 THEN '45-54'
              WHEN idade_atual_cliente < 65 THEN '55-64'
              ELSE '65+'
            END AS faixa_etaria,
            CASE 
              WHEN estado_cliente IN ('AC','AM','AP','PA','RO','RR','TO') THEN 'Norte'
              WHEN estado_cliente IN ('AL','BA','CE','MA','PB','PE','PI','RN','SE') THEN 'Nordeste'
              WHEN estado_cliente IN ('DF','GO','MS','MT') THEN 'Centro-Oeste'
              WHEN estado_cliente IN ('ES','MG','RJ','SP') THEN 'Sudeste'
              WHEN estado_cliente IN ('PR','RS','SC') THEN 'Sul'
              ELSE 'NAO INFORMADO'
            END AS regiao,
            COALESCE(descricao_canal_produto, 'NAO INFORMADO') AS canal,
            venda_liquida,
            PERCENT_RANK() OVER (ORDER BY venda_liquida DESC) AS pct_rank
          FROM retail_db.refined.customer_lifecycle_history
          WHERE CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
            AND poder_de_compra_cliente = 'Classe A'
            AND genero_cliente != 'NAO INFORMADO'
            AND venda_liquida > 0
        ),
        top_10_pct AS (
          SELECT * FROM classe_a WHERE pct_rank <= 0.1
        ),
        perfil_dominante AS (
          SELECT
            genero_cliente,
            faixa_etaria,
            regiao,
            canal,
            COUNT(*) AS cnt,
            ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) AS rn
          FROM top_10_pct
          GROUP BY genero_cliente, faixa_etaria, regiao, canal
        )
        SELECT
          (SELECT genero_cliente FROM perfil_dominante WHERE rn = 1) AS genero_dominante,
          (SELECT faixa_etaria FROM perfil_dominante WHERE rn = 1) AS faixa_etaria_dominante,
          (SELECT regiao FROM perfil_dominante WHERE rn = 1) AS regiao_dominante,
          (SELECT canal FROM perfil_dominante WHERE rn = 1) AS canal_dominante,
          (SELECT COUNT(*) FROM top_10_pct) AS total_referencia
        """
        response = await self.db.execute_query_async(query, "GrowthDomainRepository")

        result = {}
        if response.get("status") == "success" and response.get("result"):
            result = response["result"][0]

        # Fetch top entry categories separately for cleaner SQL
        cat_query = """
        WITH classe_a_novos AS (
          SELECT
            v.grupo_produto,
            COUNT(DISTINCT v.codigo_cliente_venda) AS volume
          FROM retail_db.refined.store_sales_products v
          JOIN retail_db.refined.customer_lifecycle_history c
            ON v.codigo_cliente_venda = c.codigo_cliente
            AND c.data_partition = CAST(DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS BIGINT)
          WHERE c.poder_de_compra_cliente = 'Classe A'
            AND c.ciclo_vida_granular ILIKE '%novo%'
            AND v.data_partition = CAST(DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS INT)
            AND v.grupo_produto IS NOT NULL
          GROUP BY v.grupo_produto
          ORDER BY volume DESC
          LIMIT 5
        )
        SELECT COLLECT_LIST(grupo_produto) AS top_categorias FROM classe_a_novos
        """
        cat_response = await self.db.execute_query_async(
            cat_query, "GrowthDomainRepository"
        )
        if cat_response.get("status") == "success" and cat_response.get("result"):
            result["top_categorias"] = cat_response["result"][0].get(
                "top_categorias", []
            )
        else:
            result["top_categorias"] = []

        return result

    async def get_cohort_analysis(self) -> Dict[str, Any]:
        """
        Cohort Analysis: MTD new customer safra vs LY safra.

        Returns retention tracking (R1, R2, R3) and ticket médio for both periods.
        """
        query = """
        WITH novos_atual AS (
          SELECT
            codigo_cliente,
            MIN(ultima_compra) AS primeira_compra
          FROM retail_db.refined.customer_lifecycle_history
          WHERE CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
            AND ciclo_vida_granular ILIKE '%novo%'
            AND cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
          GROUP BY codigo_cliente
        ),
        novos_ly AS (
          SELECT
            codigo_cliente,
            MIN(ultima_compra) AS primeira_compra
          FROM retail_db.refined.customer_lifecycle_history
          WHERE CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
            AND ciclo_vida_granular ILIKE '%novo%'
            AND cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
          GROUP BY codigo_cliente
        ),
        recompra_atual AS (
          SELECT
            na.codigo_cliente,
            COUNT(DISTINCT CASE WHEN DATEDIFF(v.data_venda, na.primeira_compra) BETWEEN 1 AND 30 THEN v.numero_ticket END) AS compras_r1,
            COUNT(DISTINCT CASE WHEN DATEDIFF(v.data_venda, na.primeira_compra) BETWEEN 31 AND 60 THEN v.numero_ticket END) AS compras_r2,
            COUNT(DISTINCT CASE WHEN DATEDIFF(v.data_venda, na.primeira_compra) BETWEEN 61 AND 90 THEN v.numero_ticket END) AS compras_r3
          FROM novos_atual na
          LEFT JOIN retail_db.refined.store_sales_products v
            ON v.codigo_cliente_venda = na.codigo_cliente
            AND v.data_venda > na.primeira_compra
          GROUP BY na.codigo_cliente
        ),
        ticket_atual AS (
          SELECT ROUND(AVG(c.venda_liquida_12_meses / NULLIF(c.tickets_12_meses, 0)), 2) AS ticket_medio
          FROM retail_db.refined.customer_lifecycle_history c
          WHERE CAST(c.data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
            AND c.ciclo_vida_granular ILIKE '%novo%'
            AND c.cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
            AND c.tickets_12_meses > 0
        ),
        ticket_ly AS (
          SELECT ROUND(AVG(c.venda_liquida_12_meses / NULLIF(c.tickets_12_meses, 0)), 2) AS ticket_medio
          FROM retail_db.refined.customer_lifecycle_history c
          WHERE CAST(c.data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
            AND c.ciclo_vida_granular ILIKE '%novo%'
            AND c.cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
            AND c.tickets_12_meses > 0
        )
        SELECT
          DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS safra_atual_id,
          DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM') AS safra_ly_id,
          (SELECT COUNT(*) FROM novos_atual) AS novos_atual,
          (SELECT COUNT(*) FROM novos_ly) AS novos_ly,
          (SELECT COUNT(*) FROM recompra_atual WHERE compras_r1 > 0) AS r1_atual,
          (SELECT COUNT(*) FROM recompra_atual WHERE compras_r2 > 0) AS r2_atual,
          (SELECT COUNT(*) FROM recompra_atual WHERE compras_r3 > 0) AS r3_atual,
          0 AS r1_ly, 0 AS r2_ly, 0 AS r3_ly,
          (SELECT ticket_medio FROM ticket_atual) AS ticket_medio_atual,
          (SELECT ticket_medio FROM ticket_ly) AS ticket_medio_ly
        """
        response = await self.db.execute_query_async(query, "GrowthDomainRepository")

        if response.get("status") == "success" and response.get("result"):
            return response["result"][0]

        logger.error(
            f"Failed to fetch Cohort Analysis: {response.get('error_message')}"
        )
        return {}

    async def get_cohort_product_mix(self) -> List[Dict[str, Any]]:
        """
        Product Mix comparison for new customers: MTD vs LY.

        Returns Top 10 categories by volume with YoY comparison.
        """
        query = """
        WITH vendas_novos_atual AS (
          SELECT
            v.grupo_produto AS categoria,
            COUNT(DISTINCT v.codigo_cliente_venda) AS volume_atual
          FROM retail_db.refined.store_sales_products v
          JOIN retail_db.refined.customer_lifecycle_history c
            ON v.codigo_cliente_venda = c.codigo_cliente
            AND c.data_partition = CAST(DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS BIGINT)
          WHERE c.ciclo_vida_granular ILIKE '%novo%'
            AND v.data_partition = CAST(DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS INT)
            AND v.grupo_produto IS NOT NULL
          GROUP BY v.grupo_produto
        ),
        vendas_novos_ly AS (
          SELECT
            v.grupo_produto AS categoria,
            COUNT(DISTINCT v.codigo_cliente_venda) AS volume_ly
          FROM retail_db.refined.store_sales_products v
          JOIN retail_db.refined.customer_lifecycle_history c
            ON v.codigo_cliente_venda = c.codigo_cliente
            AND c.data_partition = CAST(DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM') AS BIGINT)
          WHERE c.ciclo_vida_granular ILIKE '%novo%'
            AND v.data_partition = CAST(DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM') AS INT)
            AND v.grupo_produto IS NOT NULL
          GROUP BY v.grupo_produto
        )
        SELECT
          COALESCE(a.categoria, ly.categoria) AS categoria,
          COALESCE(a.volume_atual, 0) AS volume_atual,
          COALESCE(ly.volume_ly, 0) AS volume_ly,
          DATE_FORMAT(CURRENT_DATE(), 'yyyyMM') AS safra_referencia
        FROM vendas_novos_atual a
        FULL OUTER JOIN vendas_novos_ly ly ON a.categoria = ly.categoria
        ORDER BY COALESCE(a.volume_atual, 0) DESC
        LIMIT 10
        """
        response = await self.db.execute_query_async(query, "GrowthDomainRepository")

        if response.get("status") == "success" and response.get("result"):
            return response["result"]

        logger.error(
            f"Failed to fetch Cohort Product Mix: {response.get('error_message')}"
        )
        return []

    async def get_churn_decision_matrix(self) -> Dict[str, Any]:
        """
        Churn Decision Matrix: Behavioral patterns by cluster × channel.

        Returns granular churn data for the RetentionDomainService
        to apply business rules and compute recommended actions.
        """
        query = """
        WITH churn_patterns AS (
          SELECT
            cluster_atual,
            COALESCE(descricao_canal_produto, 'NAO INFORMADO') AS canal_ultimo,
            COUNT(DISTINCT codigo_cliente) AS total_churned,
            ROUND(AVG(DATEDIFF(CURRENT_DATE(), ultima_compra)), 0) AS avg_recencia_dias,
            ROUND(AVG(tickets_12_meses), 1) AS avg_frequencia_pre_churn
          FROM retail_db.refined.customer_lifecycle_history
          WHERE CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
            AND ciclo_vida_granular IN ('Abandonador', 'Abandonador Mes')
            AND cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
          GROUP BY cluster_atual, descricao_canal_produto
        ),
        taxa AS (
          SELECT
            ROUND(
              COUNT(DISTINCT CASE WHEN ciclo_vida_granular IN ('Abandonador', 'Abandonador Mes') THEN codigo_cliente END) * 100.0
              / NULLIF(COUNT(DISTINCT codigo_cliente), 0), 2
            ) AS taxa_churn_pct
          FROM retail_db.refined.customer_lifecycle_history
          WHERE CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
            AND cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
        )
        SELECT
          (SELECT COLLECT_LIST(
            NAMED_STRUCT(
              'cluster_atual', cluster_atual,
              'canal_ultimo', canal_ultimo,
              'total_churned', total_churned,
              'avg_recencia_dias', avg_recencia_dias,
              'avg_frequencia_pre_churn', avg_frequencia_pre_churn
            )
          ) FROM churn_patterns) AS churn_patterns,
          (SELECT taxa_churn_pct FROM taxa) AS taxa_churn_pct
        """
        response = await self.db.execute_query_async(query, "GrowthDomainRepository")

        if response.get("status") == "success" and response.get("result"):
            return response["result"][0]

        logger.error(
            f"Failed to fetch Churn Decision Matrix: {response.get('error_message')}"
        )
        return {"churn_patterns": [], "taxa_churn_pct": 0.0}

    async def get_ltv_by_cluster_and_channel(self) -> List[Dict[str, Any]]:
        """
        LTV by Cluster × Channel with YoY comparison.
        """
        query = """
        WITH current_period AS (
          SELECT
            cluster_atual,
            COALESCE(descricao_canal_produto, 'NAO INFORMADO') AS canal,
            ROUND(AVG(venda_liquida_12_meses), 2) AS ltv_medio,
            COUNT(DISTINCT codigo_cliente) AS total_clientes
          FROM retail_db.refined.customer_lifecycle_history
          WHERE CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
            AND cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
            AND ciclo_vida_granular NOT IN ('Abandonador', 'Abandonador Mes')
            AND venda_liquida_12_meses > 0
          GROUP BY cluster_atual, descricao_canal_produto
        ),
        ly_period AS (
          SELECT
            cluster_atual,
            COALESCE(descricao_canal_produto, 'NAO INFORMADO') AS canal,
            ROUND(AVG(venda_liquida_12_meses), 2) AS ltv_medio_ly
          FROM retail_db.refined.customer_lifecycle_history
          WHERE CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
            AND cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
            AND ciclo_vida_granular NOT IN ('Abandonador', 'Abandonador Mes')
            AND venda_liquida_12_meses > 0
          GROUP BY cluster_atual, descricao_canal_produto
        )
        SELECT
          c.cluster_atual,
          c.canal,
          c.ltv_medio,
          c.total_clientes,
          COALESCE(l.ltv_medio_ly, 0) AS ltv_medio_ly,
          ROUND(((c.ltv_medio - COALESCE(l.ltv_medio_ly, c.ltv_medio)) * 100.0) / NULLIF(l.ltv_medio_ly, 0), 2) AS variacao_yoy_pct
        FROM current_period c
        LEFT JOIN ly_period l
          ON c.cluster_atual = l.cluster_atual AND c.canal = l.canal
        ORDER BY c.cluster_atual, c.ltv_medio DESC
        """
        response = await self.db.execute_query_async(query, "GrowthDomainRepository")

        if response.get("status") == "success" and response.get("result"):
            return response["result"]

        logger.error(
            f"Failed to fetch LTV by Cluster/Channel: {response.get('error_message')}"
        )
        return []

    async def get_omni_channel_correlation(self) -> List[Dict[str, Any]]:
        """
        Omni vs Single-Channel behavioral comparison.

        Compares Ticket Médio, Frequência, and LTV between
        Omni and Single-Channel Target customers.
        """
        query = """
        WITH classified AS (
          SELECT
            codigo_cliente,
            CASE
              WHEN descricao_canal_produto = 'Omnichannel' THEN 'Omni'
              ELSE 'Single'
            END AS tipo_canal,
            venda_liquida_12_meses,
            tickets_12_meses,
            CASE WHEN tickets_12_meses > 0
              THEN ROUND(venda_liquida_12_meses / tickets_12_meses, 2)
              ELSE 0
            END AS ticket_medio
          FROM retail_db.refined.customer_lifecycle_history
          WHERE CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
            AND cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
            AND ciclo_vida_granular NOT IN ('Abandonador', 'Abandonador Mes')
            AND venda_liquida_12_meses > 0
        )
        SELECT
          'Ticket Médio' AS metrica,
          ROUND(AVG(CASE WHEN tipo_canal = 'Omni' THEN ticket_medio END), 2) AS valor_omni,
          ROUND(AVG(CASE WHEN tipo_canal = 'Single' THEN ticket_medio END), 2) AS valor_single
        FROM classified

        UNION ALL

        SELECT
          'Frequência Anual' AS metrica,
          ROUND(AVG(CASE WHEN tipo_canal = 'Omni' THEN tickets_12_meses END), 2) AS valor_omni,
          ROUND(AVG(CASE WHEN tipo_canal = 'Single' THEN tickets_12_meses END), 2) AS valor_single
        FROM classified

        UNION ALL

        SELECT
          'LTV Médio' AS metrica,
          ROUND(AVG(CASE WHEN tipo_canal = 'Omni' THEN venda_liquida_12_meses END), 2) AS valor_omni,
          ROUND(AVG(CASE WHEN tipo_canal = 'Single' THEN venda_liquida_12_meses END), 2) AS valor_single
        FROM classified
        """
        response = await self.db.execute_query_async(query, "GrowthDomainRepository")

        if response.get("status") == "success" and response.get("result"):
            return response["result"]

        logger.error(
            f"Failed to fetch Omni Channel Correlation: {response.get('error_message')}"
        )
        return []

    async def get_omni_volumetry(self) -> List[Dict[str, Any]]:
        """
        Channel volumetry breakdown: weight of each channel in the total active base.
        """
        query = """
        WITH current_vol AS (
          SELECT
            COALESCE(descricao_canal_produto, 'NAO INFORMADO') AS canal,
            COUNT(DISTINCT codigo_cliente) AS volume_clientes
          FROM retail_db.refined.customer_lifecycle_history
          WHERE CAST(data_partition AS STRING) = DATE_FORMAT(CURRENT_DATE(), 'yyyyMM')
            AND cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
            AND ciclo_vida_granular NOT IN ('Abandonador', 'Abandonador Mes')
          GROUP BY descricao_canal_produto
        ),
        ly_vol AS (
          SELECT
            COALESCE(descricao_canal_produto, 'NAO INFORMADO') AS canal,
            COUNT(DISTINCT codigo_cliente) AS volume_clientes_ly
          FROM retail_db.refined.customer_lifecycle_history
          WHERE CAST(data_partition AS STRING) = DATE_FORMAT(ADD_MONTHS(CURRENT_DATE(), -12), 'yyyyMM')
            AND cluster_atual IN ('Premium', 'Alto Potencial', 'Médio Potencial')
            AND ciclo_vida_granular NOT IN ('Abandonador', 'Abandonador Mes')
          GROUP BY descricao_canal_produto
        ),
        total AS (
          SELECT SUM(volume_clientes) AS total_geral FROM current_vol
        )
        SELECT
          c.canal,
          c.volume_clientes,
          COALESCE(l.volume_clientes_ly, 0) AS volume_clientes_ly,
          ROUND((c.volume_clientes * 100.0) / t.total_geral, 2) AS participacao_pct,
          ROUND(((c.volume_clientes - COALESCE(l.volume_clientes_ly, c.volume_clientes)) * 100.0) / NULLIF(l.volume_clientes_ly, 0), 2) AS variacao_yoy_pct
        FROM current_vol c
        LEFT JOIN ly_vol l ON c.canal = l.canal
        CROSS JOIN total t
        ORDER BY c.volume_clientes DESC
        """
        response = await self.db.execute_query_async(query, "GrowthDomainRepository")

        if response.get("status") == "success" and response.get("result"):
            return response["result"]

        logger.error(f"Failed to fetch Omni Volumetry: {response.get('error_message')}")
        return []


databricks_repository = DatabricksRepository()
