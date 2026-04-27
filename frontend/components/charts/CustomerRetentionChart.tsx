import React, { useMemo } from 'react';
import PieChart from './PieChart';
import { ChartData } from '../../services/reportService';
import { CHART_COLORS } from '../../constants';

interface Props {
    data: ChartData;
}

const CustomerRetentionChart: React.FC<Props> = ({ data }) => {
    const rawData = useMemo(() => {
        const d = data?.datasets?.[0]?.data;
        return Array.isArray(d) ? d : [];
    }, [data]);

    const pieData = useMemo(() => {
        if (!rawData || rawData.length === 0) return null;

        const labels = rawData.map((r: any) => r.ciclo_vida_granular || 'Desconhecido');
        const values = rawData.map((r: any) => r.total_clientes || 0);

        // Define specific colors for retention statuses if possible
        const bgColors = labels.map((label: string) => {
            const lower = label.toLowerCase();
            if (lower.includes('novo')) return '#3b82f6'; // blue-500
            if (lower.includes('ativo')) return '#10b981'; // emerald-500
            if (lower.includes('recuperado')) return '#8b5cf6'; // violet-500
            if (lower.includes('abandono') || lower.includes('churn')) return '#ef4444'; // red-500
            return CHART_COLORS[0];
        });

        // Use custom colors or fallback to default
        const useColors = bgColors.some((c: string) => c !== CHART_COLORS[0]) ? bgColors : CHART_COLORS.slice(0, labels.length);

        return {
            labels: labels,
            datasets: [{
                label: 'Clientes',
                data: values,
                backgroundColor: useColors,
                borderWidth: 2,
            }]
        };
    }, [rawData]);

    return (
        <div className="flex-1 w-full relative flex flex-col items-center min-h-[250px]">
            {pieData ? (
                <>
                    <div className="flex-1 w-full flex items-center justify-center">
                        <PieChart data={pieData as any} />
                    </div>
                    {/* Add a custom legend to show percentages */}
                    <div className="w-full mt-4 flex flex-wrap justify-center gap-4 text-xs">
                        {rawData.map((r: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-1.5">
                                <span
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: pieData.datasets[0].backgroundColor[idx % pieData.datasets[0].backgroundColor.length] as string }}
                                ></span>
                                <span className="text-muted-foreground">{r.ciclo_vida_granular}</span>
                                <span className="font-semibold text-foreground">{r.percentual}%</span>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="text-muted-foreground text-sm flex-1 flex items-center justify-center">Sem dados de retenção.</div>
            )}
        </div>
    );
};

export default CustomerRetentionChart;
