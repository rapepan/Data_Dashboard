import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip } from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { HourlySeries, SeriesToggle } from '../types/dashboard';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

interface HourlyChartProps {
  hourly: HourlySeries;
  series: SeriesToggle;
}

export const SERIES_META = [
  { key: 'opd' as const, short: 'OPD', label: 'ผู้ป่วยนอก (OPD)', color: '#0ea5e9', fill: true },
  { key: 'ipd' as const, short: 'IPD', label: 'ผู้ป่วยใน (IPD)', color: '#8b5cf6', fill: false },
  { key: 'er' as const, short: 'ER', label: 'อุบัติเหตุ-ฉุกเฉิน (ER)', color: '#f43f5e', fill: false },
];

export default function HourlyChart({ hourly, series }: HourlyChartProps) {
  const datasets = SERIES_META.filter(meta => series[meta.key]).map(meta => ({
    label: meta.label,
    data: hourly[meta.key],
    borderColor: meta.color,
    backgroundColor: `${meta.color}1a`,
    pointBackgroundColor: meta.color,
    fill: meta.fill,
    tension: 0.4,
    pointRadius: 3.5,
    pointHoverRadius: 5,
    borderWidth: 2,
  }));

  return (
    <div className="chart-canvas">
      <Line
        data={{ labels: hourly.labels, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
            y: { beginAtZero: true, grid: { color: '#eef2f7' }, border: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
          },
        }}
      />
    </div>
  );
}
