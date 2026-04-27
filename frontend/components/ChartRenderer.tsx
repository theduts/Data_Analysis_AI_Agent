import React, { useEffect, useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Line, Pie } from 'react-chartjs-2';
import { ChartData } from '../types';
import { CHART_COLORS } from '../constants';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface ChartRendererProps {
  chartData: ChartData;
}

const getCssVariableValue = (varName: string) => {
  if (typeof document === 'undefined') return '';
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value ? `hsl(${value})` : '';
};

const ChartRenderer: React.FC<ChartRendererProps> = ({ chartData }) => {
  const [themeColors, setThemeColors] = useState({
    foreground: '',
    border: '',
    card: '',
    mutedForeground: '',
  });

  useEffect(() => {
    const updateColors = () => {
      setThemeColors({
        foreground: getCssVariableValue('--foreground'),
        border: getCssVariableValue('--border'),
        card: getCssVariableValue('--card'),
        mutedForeground: getCssVariableValue('--muted-foreground'),
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

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  const textColor = themeColors.foreground || 'hsl(0 0% 12%)';
  const gridColor = themeColors.border || 'hsl(0 0% 88%)';
  const tooltipBackground = themeColors.card || 'hsl(0 0% 100%)';
  const tooltipBody = themeColors.mutedForeground || 'hsl(0 0% 42%)';

  const labels = chartData.data.map(d => d.name);
  const values = chartData.data.map(d => d.value);

  const data = {
    labels,
    datasets: [
      {
        label: chartData.title || 'Valor',
        data: values,
        backgroundColor: chartData.type === 'pie' ? CHART_COLORS : CHART_COLORS[0],
        borderColor: chartData.type === 'pie' ? CHART_COLORS : CHART_COLORS[0],
        borderWidth: 1,
      },
    ],
  };

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    color: textColor,
    plugins: {
      legend: {
        labels: {
          color: textColor,
        },
      },
      tooltip: {
        backgroundColor: tooltipBackground,
        titleColor: textColor,
        bodyColor: tooltipBody,
        borderColor: gridColor,
        borderWidth: 1,
      },
    }
  };

  const scaleOptions = {
    scales: {
      x: {
        ticks: { color: textColor },
        grid: { color: gridColor },
      },
      y: {
        ticks: { color: textColor },
        grid: { color: gridColor },
      }
    }
  };

  const renderChart = () => {
    switch (chartData.type) {
      case 'bar':
        return <Bar data={data} options={{ ...commonOptions, ...scaleOptions }} />;
      case 'line':
        return <Line data={data} options={{ ...commonOptions, ...scaleOptions }} />;
      case 'pie':
        return <Pie data={data} options={commonOptions} />;
      default:
        return <p className="text-muted-foreground">Unsupported chart type</p>;
    }
  };

  return (
    <div className="w-full h-80">
      <h3 className="text-center font-semibold mb-4 text-foreground">{chartData.title}</h3>
      <div className="w-full h-full pb-8">
        {renderChart()}
      </div>
    </div>
  );
};

export default ChartRenderer;
