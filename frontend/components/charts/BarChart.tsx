import React, { useMemo, useEffect, useState } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip as ChartTooltip,
    Legend,
    ChartData,
    ChartOptions
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { CHART_COLORS } from '../../constants';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    ChartTooltip,
    Legend
);

interface BarChartProps {
    data?: ChartData<any>;
    title?: string;
}

const getCssVariableValue = (varName: string) => {
    if (typeof document === 'undefined') return '';
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return value ? `hsl(${value})` : '';
};

const BarChart: React.FC<BarChartProps> = ({ data, title }) => {
    const [colors, setColors] = useState({
        primary: '',
        secondaryForeground: '',
        foreground: '',
        border: '',
        mutedForeground: '',
        chartBarBg: ''
    });

    useEffect(() => {
        const updateColors = () => {
            setColors({
                primary: getCssVariableValue('--primary'),
                secondaryForeground: getCssVariableValue('--secondary-foreground'),
                foreground: getCssVariableValue('--foreground'),
                border: getCssVariableValue('--border'),
                mutedForeground: getCssVariableValue('--muted-foreground'),
                chartBarBg: getCssVariableValue('--chart-bar-bg')
            });
        };

        updateColors();

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    updateColors();
                }
            });
        });

        observer.observe(document.documentElement, { attributes: true });

        return () => observer.disconnect();
    }, []);

    const chartData = useMemo(() => {
        if (!data) {
            return {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
                datasets: [
                    {
                        type: 'bar' as const,
                        label: 'Usuários Ativos',
                        data: [65, 59, 80, 81, 56, 55],
                        backgroundColor: colors.chartBarBg || CHART_COLORS[0],
                        borderRadius: 4,
                    }
                ]
            };
        }

        const datasets = data.datasets.map(ds => ({
            ...ds,
            backgroundColor: ds.backgroundColor || colors.chartBarBg || CHART_COLORS[0],
            borderColor: ds.borderColor || ds.backgroundColor || colors.chartBarBg || CHART_COLORS[0],
            borderWidth: 1,
        }));

        return {
            labels: data.labels || [],
            datasets
        };
    }, [data, colors.chartBarBg]);

    // Check if any dataset is stacked
    const isStacked = useMemo(() => {
        return chartData.datasets.some(ds => ds.stack);
    }, [chartData]);

    const options: ChartOptions<any> = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top' as const,
                labels: {
                    color: colors.foreground || 'hsl(222.2, 84%, 4.9%)',
                }
            },
            title: {
                display: !!title,
                text: title,
                color: colors.foreground || 'hsl(222.2, 84%, 4.9%)',
                font: {
                    size: 16,
                    weight: 'bold'
                }
            },
            tooltip: {
                mode: 'index' as const,
                intersect: false,
            },
        },
        scales: {
            x: {
                stacked: isStacked,
                grid: {
                    color: colors.border || 'hsl(220, 13%, 82%)',
                    display: false,
                },
                ticks: {
                    color: colors.mutedForeground || 'hsl(215.4, 16.3%, 46.9%)',
                }
            },
            y: {
                stacked: isStacked,
                grid: {
                    color: colors.border || 'hsl(220, 13%, 82%)',
                },
                ticks: {
                    color: colors.mutedForeground || 'hsl(215.4, 16.3%, 46.9%)',
                }
            }
        }
    };

    return (
        <div className="w-full h-full min-h-[250px]">
            <Bar data={chartData} options={options} />
        </div>
    );
};

export default BarChart;
