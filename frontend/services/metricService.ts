import { AuthService } from './authService';
import { getLocalCache, setLocalCache } from '../utils/localCache';

export interface MetricInsight {
    narrative: string;
    recommended_action?: string;
}

export interface MetricChartData {
    labels: string[];
    datasets: {
        label: string;
        data: number[];
        backgroundColor?: string | string[];
        borderColor?: string | string[];
        [key: string]: any;
    }[];
}

export interface ChartMetricResult {
    id: string;
    title: string;
    description: string;
    value: string;
    previous_value: string;
    change_percentage: string;
    is_positive: boolean;
    is_improvement?: boolean; // True if the change is good/green, False if bad/red
    chart_data?: MetricChartData;
    insight?: MetricInsight;

    // YoY properties
    previous_year_value?: string;
    change_percentage_yoy?: string;
    is_positive_yoy?: boolean;
    is_improvement_yoy?: boolean;
    chart_data_yoy?: MetricChartData;
}

export interface AdvancedMetricsSummaryResponse {
    metrics: ChartMetricResult[];
}

export interface MetricQueryResponse {
    answer: string;
}

const ADVANCED_METRICS_CACHE_KEY = 'advanced-metrics-summary';
const ADVANCED_METRICS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const metricService = {
    getCachedAdvancedMetrics: (): AdvancedMetricsSummaryResponse | null => {
        return getLocalCache<AdvancedMetricsSummaryResponse>(ADVANCED_METRICS_CACHE_KEY);
    },

    getAdvancedMetrics: async (refresh: boolean = false): Promise<AdvancedMetricsSummaryResponse> => {
        if (!refresh) {
            const cached = getLocalCache<AdvancedMetricsSummaryResponse>(ADVANCED_METRICS_CACHE_KEY);
            if (cached) {
                return cached;
            }
        }

        try {
            const url = refresh ? '/metrics/summary?refresh=true' : '/metrics/summary';
            const response = await AuthService.fetchWithAuth(url);
            if (!response.ok) {
                throw new Error('Failed to fetch advanced metrics');
            }
            const payload = await response.json();
            setLocalCache(ADVANCED_METRICS_CACHE_KEY, payload, ADVANCED_METRICS_CACHE_TTL_MS);
            return payload;
        } catch (error) {
            console.error('Error fetching advanced metrics:', error);
            if (!refresh) {
                const stale = getLocalCache<AdvancedMetricsSummaryResponse>(ADVANCED_METRICS_CACHE_KEY, true);
                if (stale) {
                    return stale;
                }
            }
            throw error;
        }
    },

    askMetricQuestion: async (metricId: string, question: string, contextData: any, intentFlag?: string): Promise<MetricQueryResponse> => {
        try {
            const response = await AuthService.fetchWithAuth('/metrics/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    metric_id: metricId,
                    question: question,
                    context_data: contextData,
                    intent_flag: intentFlag,
                }),
            });
            if (!response.ok) {
                throw new Error('Failed to ask question');
            }
            return await response.json();
        } catch (error) {
            console.error(`Error asking question about metric ${metricId}:`, error);
            throw error;
        }
    }
};
