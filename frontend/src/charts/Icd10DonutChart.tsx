import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import type { Icd10Item } from '../types/icd10';

ChartJS.register(ArcElement, Tooltip);

const TOP_COLORS = ['#4f46e5', '#8b5cf6', '#f59e0b', '#f97316', '#e11d48'];
const OTHER_COLOR = '#cbd5e1';

interface Icd10DonutChartProps {
  /** อันดับโรคทั้งหมด (เรียงมากไปน้อย) */
  items: Icd10Item[];
  /** จำนวนครั้งรวมทุกโรค — ส่วนที่เหลือจาก Top 5 คือ "อื่น ๆ" */
  totalVisits: number;
  totalCodes: number;
}

/** สัดส่วน Top 5 โรคหลัก เทียบกับโรคอื่นทั้งหมด (ตามจำนวนครั้ง) */
export default function Icd10DonutChart({ items, totalVisits, totalCodes }: Icd10DonutChartProps) {
  const top = items.slice(0, 5);
  const others = Math.max(0, totalVisits - top.reduce((sum, item) => sum + item.visits, 0));
  const slices = [
    ...top.map((item, i) => ({ label: `[${item.code}] ${item.name}`, value: item.visits, color: TOP_COLORS[i] })),
    { label: `อื่น ๆ (${Math.max(0, totalCodes - top.length).toLocaleString('en-US')} โรค)`, value: others, color: OTHER_COLOR },
  ];

  return (
    <div className="donut-wrap">
      <div className="donut-canvas lg">
        <Doughnut
          data={{
            labels: slices.map(s => s.label),
            datasets: [{ data: slices.map(s => s.value), backgroundColor: slices.map(s => s.color), borderWidth: 2, borderColor: '#fff' }],
          }}
          options={{
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: ctx => ` ${(ctx.raw as number).toLocaleString('en-US')} ครั้ง (${totalVisits ? Math.round(((ctx.raw as number) / totalVisits) * 100) : 0}%)` } },
            },
          }}
        />
      </div>
      <ul className="donut-legend">
        {slices.map(slice => (
          <li key={slice.label} data-tip={slice.label}>
            <span className="legend-square" style={{ background: slice.color }} />
            <span className="legend-text">{slice.label}</span>
            <b>{totalVisits ? Math.round((slice.value / totalVisits) * 100) : 0}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
