import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, BarChart2, TrendingUp, Bot, X } from 'lucide-react';
import { metricService, AdvancedMetricsSummaryResponse, ChartMetricResult } from '../services/metricService';
import MetricInsightPanel from './metrics/MetricInsightPanel';
import BarChart from './charts/BarChart';

interface AdvancedChartsViewProps {
    onChatWithAI?: (metric: ChartMetricResult) => void;
    onClose?: () => void;
}

const AdvancedChartsView: React.FC<AdvancedChartsViewProps> = ({ onChatWithAI, onClose }) => {
    const initialMetricsRef = useRef<AdvancedMetricsSummaryResponse | null>(metricService.getCachedAdvancedMetrics());
    const [data, setData] = useState<AdvancedMetricsSummaryResponse | null>(initialMetricsRef.current);
    const [loading, setLoading] = useState<boolean>(!initialMetricsRef.current);
    const [error, setError] = useState<string | null>(null);
    const [selectedMetric, setSelectedMetric] = useState<ChartMetricResult | null>(
        initialMetricsRef.current?.metrics?.[0] ?? null
    );
    const [viewMode, setViewMode] = useState<'mom' | 'yoy'>('mom');

    const fetchData = useCallback(async (refresh: boolean = false) => {
        setLoading(true);
        setError(null);
        try {
            const result = await metricService.getAdvancedMetrics(refresh);
            setData(result);
            if (result.metrics && result.metrics.length > 0) {
                const initialMetric = result.metrics[0];
                setSelectedMetric(initialMetric);
            }
        } catch (err) {
            setError('Falha ao carregar os gráficos e insights.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (initialMetricsRef.current) return;
        void fetchData(false);
    }, [fetchData]);

    if (loading && !data) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-background">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Extraindo métricas e gerando insights operacionais...</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="flex-1 flex items-center justify-center flex-col gap-4 bg-background">
                <p className="text-red-500 font-medium">{error}</p>
                <button onClick={() => fetchData(false)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">
                    Tentar Novamente
                </button>
            </div>
        );
    }

    if (!data || data.metrics.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground bg-background">
                Nenhum gráfico encontrado.
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden h-full bg-background animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border bg-card">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <BarChart2 className="w-6 h-6 text-primary" />
                        Gráficos
                    </h2>
                    {error && (
                        <p className="mt-2 text-sm text-red-500">{error}</p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => fetchData(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary dark:text-white rounded-md text-sm font-medium transition-colors border border-primary/20"
                        title="Forçar sincronização com o banco de dados"
                    >
                        Atualizar Dados
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-muted rounded-full transition-colors"
                            aria-label="Fechar"
                        >
                            <X className="w-5 h-5 text-muted-foreground" />
                        </button>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {/* Metrics Selector & Viz */}
                <div className="w-full h-full flex flex-col bg-muted/10 overflow-y-auto scrollbar-thin">

                    {/* Metric KPI Cards Selector */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6">
                        {data.metrics.map(metric => (
                            <div
                                key={metric.id}
                                onClick={() => setSelectedMetric(metric)}
                                className={`p-4 rounded-xl border ${selectedMetric?.id === metric.id ? 'border-primary ring-1 ring-primary/30 bg-primary/5' : 'border-border bg-card hover:border-primary/50'} cursor-pointer transition-all`}
                            >
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                    {metric.title}
                                </h3>
                                <div className="text-2xl font-bold text-foreground">
                                    {viewMode === 'mom' ? metric.value : (metric.previous_year_value ?? metric.value)}
                                </div>
                                <div className="flex items-center mt-2">
                                    {(() => {
                                        const isPos = viewMode === 'mom' ? metric.is_positive : (metric.is_positive_yoy ?? metric.is_positive);
                                        const isImprov = viewMode === 'mom' ? metric.is_improvement : (metric.is_improvement_yoy ?? metric.is_improvement);
                                        const changePct = viewMode === 'mom' ? metric.change_percentage : (metric.change_percentage_yoy ?? metric.change_percentage);
                                        return (
                                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded flex items-center gap-1 ${(isImprov ?? isPos) ? 'text-emerald-600 bg-emerald-500/10' : 'text-red-600 bg-red-500/10'}`}>
                                                {isPos ? <TrendingUp className="w-3 h-3" /> : <TrendingUp className="w-3 h-3 rotate-180" />}
                                                {changePct}
                                            </span>
                                        );
                                    })()}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Active Visualization */}
                    {selectedMetric && (
                        <div className="p-6 pt-0 flex-1 flex flex-col">
                            <div className="bg-card border border-border rounded-xl p-6 flex-1 flex flex-col min-h-[400px]">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-6 gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-1">
                                            <h4 className="font-semibold text-xl">{selectedMetric.title}</h4>
                                            <button
                                                onClick={() => onChatWithAI?.(selectedMetric)}
                                                className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 dark:bg-primary/30 dark:text-primary-foreground dark:border-primary/40 rounded-full text-xs font-semibold transition-colors shadow-sm"
                                            >
                                                <Bot className="w-3.5 h-3.5" />
                                                Conversar sobre essa métrica
                                            </button>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{selectedMetric.description}</p>
                                    </div>

                                    <div className="flex bg-muted/50 p-1 rounded-lg border border-border">
                                        <button
                                            onClick={() => setViewMode('mom')}
                                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'mom'
                                                ? 'bg-background shadow-sm text-foreground'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                                                }`}
                                        >
                                            MoM
                                        </button>
                                        <button
                                            onClick={() => setViewMode('yoy')}
                                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'yoy'
                                                ? 'bg-background shadow-sm text-foreground'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                                                }`}
                                        >
                                            YoY
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1 relative w-full flex items-center justify-center min-h-[400px]">
                                    {(() => {
                                        const activeChartData = viewMode === 'mom' ? selectedMetric.chart_data : (selectedMetric.chart_data_yoy ?? null);
                                        return activeChartData ? (
                                            <BarChart data={activeChartData as any} />
                                        ) : (
                                            <div className="text-center p-8 border-2 border-dashed border-border rounded-lg">
                                                <div className="text-2xl font-bold text-muted-foreground mb-2">Sem dados para {viewMode.toUpperCase()}</div>
                                                <p className="text-muted-foreground text-sm">Os dados históricos para este período ainda não foram processados.</p>
                                            </div>
                                        )
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdvancedChartsView;
