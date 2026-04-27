import { AuthService } from './authService';
import { getLocalCache, setLocalCache } from '../utils/localCache';

export interface MetricValue {
    value: string;
    change: string;
    is_positive: boolean;
}

export interface ChartData {
    labels: string[];
    datasets: {
        label: string;
        data: number[];
        backgroundColor?: string | string[];
        borderColor?: string | string[];
        [key: string]: any;
    }[];
}

export interface ReportResponse {
    total_users?: MetricValue;
    conversion_rate?: MetricValue;
    engagement?: MetricValue;
    risk_index_target?: MetricValue;
    monthly_growth: ChartData;
    metrics_distribution: ChartData;
    customer_profile?: any;
    customer_retention?: ChartData;
    customer_heatmap?: any;
}

export interface BranchMetricItem {
    filial: string;
    total_clientes: number;
    percentual: number;
}

export interface StateBranchesResponse {
    state: string;
    channel: string;
    is_target: boolean;
    branches: BranchMetricItem[];
}

const WEEKLY_REPORT_CACHE_KEY = 'weekly-report';
const WEEKLY_REPORT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STATE_BRANCHES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const getStateBranchesCacheKey = (state: string, channel: string, isTarget: boolean) =>
    `weekly-report:state-branches:${state}:${channel}:${isTarget ? 'target' : 'geral'}`;

export const reportService = {
    getCachedWeeklyReport: (): ReportResponse | null => {
        return getLocalCache<ReportResponse>(WEEKLY_REPORT_CACHE_KEY);
    },

    getWeeklyReport: async (refresh: boolean = false): Promise<ReportResponse> => {
        if (!refresh) {
            const cached = getLocalCache<ReportResponse>(WEEKLY_REPORT_CACHE_KEY);
            if (cached) {
                return cached;
            }
        }

        try {
            const url = refresh ? '/report/?refresh=true' : '/report/';
            const response = await AuthService.fetchWithAuth(url);
            if (!response.ok) {
                throw new Error('Failed to fetch report');
            }
            const payload = await response.json();
            setLocalCache(WEEKLY_REPORT_CACHE_KEY, payload, WEEKLY_REPORT_CACHE_TTL_MS);
            return payload;
        } catch (error) {
            console.error('Error fetching weekly report:', error);
            if (!refresh) {
                const stale = getLocalCache<ReportResponse>(WEEKLY_REPORT_CACHE_KEY, true);
                if (stale) {
                    return stale;
                }
            }
            throw error;
        }
    },
    getStateBranches: async (state: string, channel: string, is_target: boolean): Promise<StateBranchesResponse> => {
        const cacheKey = getStateBranchesCacheKey(state, channel, is_target);
        const cached = getLocalCache<StateBranchesResponse>(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            const url = `/report/heatmap/branches?state=${encodeURIComponent(state)}&channel=${encodeURIComponent(channel)}&is_target=${is_target}`;
            const response = await AuthService.fetchWithAuth(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch branches for state ${state}`);
            }
            const payload = await response.json();
            setLocalCache(cacheKey, payload, STATE_BRANCHES_CACHE_TTL_MS);
            return payload;
        } catch (error) {
            console.error('Error fetching state branches:', error);
            const stale = getLocalCache<StateBranchesResponse>(cacheKey, true);
            if (stale) {
                return stale;
            }
            throw error;
        }
    },
    streamExecutiveSummary: async (
        onNext: (token: string) => void,
        onError: (error: Error) => void,
        onComplete: () => void
    ) => {
        try {
            const response = await AuthService.fetchWithAuth('/report/executive-summary/stream', {
                method: 'POST',
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || `Erro ${response.status} ao chamar o backend.`);
            }

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    onNext(chunk);
                }
            } finally {
                reader.releaseLock();
            }

            onComplete();

        } catch (err) {
            onError(err instanceof Error ? err : new Error(String(err)));
        }
    },
    downloadExecutivePDF: async (markdownText: string): Promise<Blob> => {
        try {
            const response = await AuthService.fetchWithAuth('/report/pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markdown_text: markdownText })
            });

            if (!response.ok) {
                throw new Error("Falha ao gerar o PDF");
            }

            return await response.blob();
        } catch (error) {
            console.error('Error generating PDF:', error);
            throw error;
        }
    }
};
