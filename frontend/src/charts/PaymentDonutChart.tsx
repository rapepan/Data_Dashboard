import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import type { PaymentMixItem } from '../types/dashboard';

ChartJS.register(ArcElement, Tooltip);

interface PaymentDonutChartProps {
  items: PaymentMixItem[];
}

export default function PaymentDonutChart({ items }: PaymentDonutChartProps) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="donut-wrap">
      <div className="donut-canvas">
        <Doughnut
          data={{
            labels: items.map(item => item.label),
            datasets: [{ data: items.map(item => item.value), backgroundColor: items.map(item => item.color), borderWidth: 2, borderColor: '#fff' }],
          }}
          options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '70%' }}
        />
      </div>
      <ul className="donut-legend">
        {items.map(item => (
          <li key={item.label}>
            <span className="legend-square" style={{ background: item.color }} />
            {item.label}
            <b>{Math.round((item.value / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
