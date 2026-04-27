import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart as BarChartIcon, PieChart as PieChartIcon, TrendingUp, TrendingDown, Users, Activity, Loader2, X } from 'lucide-react';
import PieChart from './charts/PieChart';
import BarChart from './charts/BarChart';
import CustomerProfileChart from './charts/CustomerProfileChart';
import CustomerRetentionChart from './charts/CustomerRetentionChart';
import CustomerHeatmap from './charts/CustomerHeatmap';
import { reportService, ReportResponse } from '../services/reportService';
import { CHART_COLORS } from '../constants';

interface DashboardProps {
    onClose?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onClose }) => {
    const initialReportRef = useRef<ReportResponse | null>(reportService.getCachedWeeklyReport());
    const [reportData, setReportData] = useState<ReportResponse | null>(initialReportRef.current);
    const [loading, setLoading] = useState<boolean>(!initialReportRef.current);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async (refresh: boolean = false) => {
        try {
            setLoading(true);
            const data = await reportService.getWeeklyReport(refresh);
            setReportData(data);
            setError(null);
        } catch (err) {
            console.error("Failed to load report", err);
            setError('Falha ao carregar os dados do relatório.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (initialReportRef.current) return;
        void fetchData(false);
    }, [fetchData]);

    const pieData = useMemo(() => {
        if (!reportData?.metrics_distribution) return undefined;
        return {
            labels: reportData.metrics_distribution.labels,
            datasets: reportData.metrics_distribution.datasets.map(ds => ({
                ...ds,
                backgroundColor: CHART_COLORS.slice(0, reportData.metrics_distribution.labels.length),
                borderWidth: 2,
            }))
        };
    }, [reportData]);

    const barData = useMemo(() => {
        if (!reportData?.monthly_growth) return undefined;

        const datasetsWithColors = reportData.monthly_growth.datasets.map((ds, index) => ({
            ...ds,
            // we use spaced index if available to avoid same colors next to each other
            backgroundColor: CHART_COLORS[index * 2 % CHART_COLORS.length] || CHART_COLORS[index % CHART_COLORS.length],
            borderRadius: 4,
        }));

        return {
            labels: reportData.monthly_growth.labels,
            datasets: datasetsWithColors
        };
    }, [reportData]);

    const MetricCard = ({ title, value, change, isPositive, icon: Icon, description }: any) => (
        <div className="bg-card text-card-foreground p-6 rounded-xl border border-border shadow-sm flex flex-col hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                    <Icon className="w-6 h-6 text-primary" />
                </div>
                <div className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-full ${isPositive ? 'text-emerald-600 bg-emerald-500/10' : 'text-red-600 bg-red-500/10'}`}>
                    {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    <span>{change}</span>
                </div>
            </div>
            <div>
                <h3 className="text-3xl font-bold tracking-tight mb-1">{value}</h3>
                <p className="text-sm font-medium text-muted-foreground">{title}</p>
                {description && <p className="text-xs text-muted-foreground mt-2 opacity-80">{description}</p>}
            </div>
        </div>
    );

    if (loading && !reportData) {
        return (
            <div className="flex-1 p-8 w-full bg-background flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Carregando métricas...</p>
            </div>
        );
    }

    if (error && !reportData) {
        return (
            <div className="flex-1 p-8 w-full bg-background flex flex-col items-center justify-center">
                <p className="text-red-500">{error}</p>
            </div>
        );
    }

    if (!reportData) {
        return (
            <div className="flex-1 p-8 w-full bg-background flex flex-col items-center justify-center">
                <p className="text-red-500">Nenhum dado disponível.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 p-8 overflow-y-auto scrollbar-thin w-full bg-background animate-fade-in">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 relative">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight mb-2 text-foreground">Recorte da Semana</h2>
                        <p className="text-muted-foreground">
                            Resumo semanal de métricas importantes calculadas com base na última competência.
                        </p>
                        {error && (
                            <p className="mt-2 text-sm text-red-500">{error}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-3 absolute right-0 top-0">
                        <button
                            onClick={() => {
                                void fetchData(true);
                            }}
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
                                <X className="w-6 h-6 text-muted-foreground" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Metrics removed by user request: Usuários Ativos, Taxa de Penetração, Engajamento */}
                </div>

                {/* Customer View Section */}
                <div className="pt-4 mt-4">
                    <h2 className="text-2xl font-bold tracking-tight mb-2 text-foreground flex items-center gap-2">
                        <Users className="w-6 h-6 text-primary" />
                        Visão do Cliente
                    </h2>
                    <p className="text-muted-foreground mb-6">
                        Análise demográfica, retenção e distribuição geográfica da carteira.
                    </p>

                    <div className="flex flex-col gap-6 mb-6">
                        {/* Perfil do Cliente — largura total para acomodar 3 colunas alinhadas */}
                        <div className="bg-card text-card-foreground p-6 rounded-xl border border-border shadow-sm flex flex-col hover:shadow-md transition-shadow">
                            <h3 className="font-semibold text-lg text-foreground mb-6">Perfil do Cliente</h3>
                            <div className="w-full">
                                <CustomerProfileChart data={reportData.customer_profile || {}} />
                            </div>
                        </div>

                        {/* Retenção de Clientes — largura total */}
                        <div className="bg-card text-card-foreground p-6 rounded-xl border border-border shadow-sm flex flex-col hover:shadow-md transition-shadow min-h-[420px]">
                            <h3 className="font-semibold text-lg text-foreground mb-6">Retenção de Clientes</h3>
                            <div className="flex-1 w-full relative">
                                <CustomerRetentionChart data={reportData.customer_retention as any} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-card text-card-foreground p-6 rounded-xl border border-border shadow-sm flex flex-col hover:shadow-md transition-shadow">
                        <h3 className="font-semibold text-lg text-foreground mb-6">Mapa de Calor</h3>
                        <div className="flex-1 w-full relative min-h-[500px]">
                            <CustomerHeatmap data={reportData.customer_heatmap || {}} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
