import React, { useEffect, useState } from 'react';
import { X, Loader2, BarChart2, TrendingUp, Users, Bot } from 'lucide-react';
import { metricService, AdvancedMetricsSummaryResponse, ChartMetricResult } from '../../services/metricService';
import MetricInsightPanel from '../metrics/MetricInsightPanel';
import BarChart from '../charts/BarChart';

interface ChartsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ChartsModal: React.FC<ChartsModalProps> = ({ isOpen, onClose }) => {
    const [data, setData] = useState<AdvancedMetricsSummaryResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedMetric, setSelectedMetric] = useState<ChartMetricResult | null>(null);
    const [viewMode, setViewMode] = useState<'mom' | 'yoy'>('mom');

    useEffect(() => {
        if (isOpen) {
            fetchData();
        } else {
            // Reset state on close
            setSelectedMetric(null);
            setData(null);
        }
    }, [isOpen]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await metricService.getAdvancedMetrics();
            setData(result);
            if (result.metrics && result.metrics.length > 0) {
                setSelectedMetric(result.metrics[0]);
            }
        } catch (err) {
            setError('Falha ao carregar os gráficos e insights.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-background w-full max-w-7xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border bg-card">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <BarChart2 className="w-6 h-6 text-primary" />
                            Gráficos
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">

                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                            <p className="text-muted-foreground">Extraindo métricas e gerando insights operacionais...</p>
                        </div>
                    ) : error ? (
                        <div className="flex-1 flex items-center justify-center flex-col gap-4">
                            <p className="text-red-500 font-medium">{error}</p>
                            <button onClick={fetchData} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">
                                Tentar Novamente
                            </button>
                        </div>
                    ) : !data || data.metrics.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                            Nenhum gráfico encontrado.
                        </div>
                    ) : (
                        <>
                            {/* Left Side: Metrics Map / Selector & Viz */}
                            <div className="w-full md:w-2/3 h-full flex flex-col border-r border-border bg-muted/10 overflow-y-auto scrollbar-thin">

                                {/* Metric KPI Cards Selector */}
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-6">
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
                                        <div className="bg-card border border-border rounded-xl p-6 flex-1 flex flex-col min-h-[300px]">
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-6 gap-4">
                                                <div>
                                                    <h4 className="font-semibold text-lg mb-1">{selectedMetric.title}</h4>
                                                    <p className="text-sm text-muted-foreground">{selectedMetric.description}</p>
                                                </div>

                                                <div className="flex bg-muted/50 p-1 rounded-lg border border-border">
                                                    <button
                                                        onClick={() => setViewMode('mom')}
                                                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'mom'
                                                            ? 'bg-background shadow-sm text-foreground'
                                                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                                                            }`}
                                                    >
                                                        MoM
                                                    </button>
                                                    <button
                                                        onClick={() => setViewMode('yoy')}
                                                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'yoy'
                                                            ? 'bg-background shadow-sm text-foreground'
                                                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                                                            }`}
                                                    >
                                                        YoY
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex-1 relative w-full flex items-center justify-center">
                                                {(() => {
                                                    const activeChartData = viewMode === 'mom' ? selectedMetric.chart_data : (selectedMetric.chart_data_yoy ?? null);
                                                    return activeChartData ? (
                                                        <BarChart data={activeChartData as any} />
                                                    ) : (
                                                        <div className="text-center">
                                                            <div className="text-4xl font-bold text-primary mb-2">{viewMode.toUpperCase()} NO DATA</div>
                                                            <p className="text-muted-foreground text-sm">O payload 'chart_data_yoy' não chegou do backend.</p>
                                                        </div>
                                                    )
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right Side: Insights Chat */}
                            <div className="w-full md:w-1/3 h-[50vh] md:h-full p-6 bg-background">
                                {selectedMetric ? (
                                    <MetricInsightPanel
                                        key={selectedMetric.id} // Force remount on metric change
                                        metricId={selectedMetric.id}
                                        metricTitle={selectedMetric.title}
                                        contextData={{
                                            selected: selectedMetric,
                                            all_metrics: data.metrics.slice(0, 6) // Send up to 6 metrics for holistic dashboard context
                                        }}
                                        initialInsight={selectedMetric.insight?.narrative}
                                    />
                                ) : (
                                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                        Selecione uma métrica para ver os insights
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ChartsModal;
