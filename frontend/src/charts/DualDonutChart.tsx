import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip);

interface DualDonutChartProps {
  labels: string[];
  colors: string[];
  /** วงนอก */
  outer: { label: string; data: number[] };
  /** วงใน (สีจางกว่า) */
  inner: { label: string; data: number[] };
  size?: number;
  /** หัวคอลัมน์แรกในตารางที่พิมพ์ */
  printCategory?: string;
}

/** โดนัท 2 ชั้น เช่น วงนอก = จำนวนครั้ง, วงใน = จำนวนคน */
export default function DualDonutChart({ labels, colors, outer, inner, size = 240, printCategory }: DualDonutChartProps) {
  const total = (data: number[]) => data.reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="dual-donut" data-print-table="sum" data-print-category={printCategory}>
      <div className="donut-box" style={{ width: size, height: size }}>
        <Doughnut
          data={{
            labels,
            datasets: [
              { label: outer.label, data: outer.data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', weight: 1.4 },
              { label: inner.label, data: inner.data, backgroundColor: colors.map(c => `${c}99`), borderWidth: 2, borderColor: '#fff', weight: 1 },
            ],
          }}
          options={{
            maintainAspectRatio: false,
            cutout: '42%',
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => {
                    const data = ctx.dataset.data as number[];
                    const value = ctx.raw as number;
                    return ` ${ctx.dataset.label}: ${value.toLocaleString('en-US')} (${((value / total(data)) * 100).toFixed(1)}%)`;
                  },
                },
              },
            },
          }}
        />
      </div>
      {/* ตอนพิมพ์ใช้ตารางที่สร้างจากกราฟ (มี % และแถวรวม) แทน */}
      <table className="dual-donut-legend no-print">
        <thead><tr><th /><th className="num">{outer.label}</th><th className="num">{inner.label}</th></tr></thead>
        <tbody>
          {labels.map((label, i) => (
            <tr key={label}>
              <td><span className="legend-dot" style={{ background: colors[i] }} />{label}</td>
              <td className="num">{outer.data[i].toLocaleString('en-US')}</td>
              <td className="num muted">{inner.data[i].toLocaleString('en-US')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
