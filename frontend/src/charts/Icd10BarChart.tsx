import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { Icd10Item } from '../types/icd10';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export type BarMode = 'both' | 'visits' | 'patients';

export const ICD_COLORS = { visits: '#4f46e5', patients: '#c084fc' };

interface Icd10BarChartProps {
  items: Icd10Item[];
  mode: BarMode;
}

/** กราฟแท่ง Top 20 รหัสโรค — แกน X เป็นรหัส (pdx) ชี้เมาส์เพื่อดูชื่อโรคเต็ม */
export default function Icd10BarChart({ items, mode }: Icd10BarChartProps) {
  const datasets = [];
  if (mode !== 'patients') {
    datasets.push({ label: 'จำนวนครั้ง (Visits)', data: items.map(i => i.visits), backgroundColor: ICD_COLORS.visits, borderRadius: 4, maxBarThickness: 22 });
  }
  if (mode !== 'visits') {
    datasets.push({ label: 'จำนวนคน (Patients)', data: items.map(i => i.patients), backgroundColor: ICD_COLORS.patients, borderRadius: 4, maxBarThickness: 22 });
  }

  return (
    <div className="chart-canvas">
      <Bar
        data={{ labels: items.map(i => i.code), datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', labels: { boxWidth: 14, boxHeight: 10, color: '#475569', font: { size: 12 } } },
            tooltip: {
              callbacks: {
                title: ctx => {
                  const item = items[ctx[0].dataIndex];
                  return `${item.code} — ${item.name}`;
                },
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#475569', font: { size: 11, weight: 600 } } },
            y: { beginAtZero: true, grid: { color: '#eef2f7' }, border: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
          },
        }}
      />
    </div>
  );
}
