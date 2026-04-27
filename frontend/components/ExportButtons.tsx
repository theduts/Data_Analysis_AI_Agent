import React from 'react';
import { ChartData } from '../types';
import { Button } from './ui/button';
import { Download } from 'lucide-react';

interface ExportButtonsProps {
  chartData: ChartData;
}

const ExportButtons: React.FC<ExportButtonsProps> = ({ chartData }) => {
  const handleExportCsv = () => {
    if (!chartData || !chartData.data || chartData.data.length === 0) {
      return;
    }

    const data = chartData.data;
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row =>
        headers.map(fieldName => {
          const value = row[fieldName];
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`;
          }
          return value;
        }).join(',')
      )
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const fileName = `${chartData.title.replace(/ /g, '_')}.csv`;
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportForPbi = () => {
    if (!chartData || !chartData.data) {
      return;
    }

    const jsonString = JSON.stringify(chartData.data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const fileName = `${chartData.title.replace(/ /g, '_')}.json`;
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mt-4 flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleExportCsv}
        aria-label="Export data to CSV"
      >
        <Download className="h-4 w-4" />
        Export CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleExportForPbi}
        title="Downloads data as a JSON file, which can be imported into Power BI."
        aria-label="Export chart data for Power BI"
      >
        <Download className="h-4 w-4" />
        Export PBIX
      </Button>
    </div>
  );
};

export default ExportButtons;