import React, { useMemo, useEffect, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, ChartData, ChartOptions } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { CHART_COLORS } from '../../constants';

ChartJS.register(ArcElement, Tooltip, Legend);

interface PieChartProps {
  data?: ChartData<'pie'>;
  title?: string;
}

const getCssVariableValue = (varName: string) => {
  if (typeof document === 'undefined') return '';
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  // values are in hsl format like "222.2 84% 4.9%"
  return value ? `hsl(${value})` : '';
};

const PieChart: React.FC<PieChartProps> = ({ data, title }) => {
  const [colors, setColors] = useState({
    primary: '',
    secondaryForeground: '',
    mutedForeground: '',
    accentForeground: '',
    background: '',
    foreground: ''
  });

  // Re-evaluate CSS variables on mount and theme change
  useEffect(() => {
    const updateColors = () => {
      setColors({
        primary: getCssVariableValue('--primary'),
        secondaryForeground: getCssVariableValue('--secondary-foreground'),
        mutedForeground: getCssVariableValue('--muted-foreground'),
        accentForeground: getCssVariableValue('--accent-foreground'),
        background: getCssVariableValue('--background'),
        foreground: getCssVariableValue('--foreground')
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
    if (data) return data;

    // Dummy data using design system colors
    return {
      labels: ['Aquisição', 'Retenção', 'Engajamento', 'Monetização'],
      datasets: [
        {
          label: 'Métricas de Crescimento',
          data: [35, 25, 20, 20],
          backgroundColor: CHART_COLORS.slice(0, 4),
          borderColor: colors.background || 'hsl(0, 0%, 100%)',
          borderWidth: 2,
        },
      ],
    };
  }, [data, colors]);

  const options: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
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
    },
  };

  return (
    <div className="w-full h-full min-h-[250px] flex justify-center items-center">
      <Pie data={chartData} options={options} />
    </div>
  );
};

export default PieChart;
