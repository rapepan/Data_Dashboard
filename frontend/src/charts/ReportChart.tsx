import {
  Chart as ChartJS, BarController, BarElement, CategoryScale, Filler, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import type { PrintTableMode } from '../utils/print';

ChartJS.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, Legend, Tooltip);

export interface ReportSeries {
  label: string;
  /** null = ไม่มีข้อมูล (เส้นจะขาดช่วง) */
  data: (number | null)[];
  color: string;
  type?: 'bar' | 'line';
  /** เส้นแบบเติมพื้นที่ใต้กราฟ */
  fill?: boolean;
  /** เส้นประ (ใช้กับเส้นรองที่ค่าน้อย) */
  dashed?: boolean;
}

interface ReportChartProps {
  labels: string[];
  series: ReportSeries[];
  /** ซ้อนแท่ง (stacked bar) */
  stacked?: boolean;
  height?: number;
  showLegend?: boolean;
  /** ไฮไลต์แท่ง index นี้ด้วยสีเน้น (เช่น ช่วงเวลาที่หนาแน่นที่สุด) */
  highlightIndex?: number;
  highlightColor?: string;
  /** แสดงตัวเลขบนหัวแท่ง (แท่งแนวนอนแบบซ้อน: ตัวเลขในแท่ง + ยอดรวมท้ายแท่ง) */
  showValues?: boolean;
  /** แท่งแนวนอน */
  horizontal?: boolean;
  /** ตารางข้อมูลที่พิมพ์ต่อท้ายกราฟ (ค่าเริ่มต้น sum = มี % และแถวรวม) — ดู utils/print.ts */
  printTable?: PrintTableMode;
  /** หัวคอลัมน์แรกของตารางที่พิมพ์ (เช่น "เดือน") */
  printCategory?: string;
}

/** กราฟแท่ง/เส้น/ผสม ที่ใช้ร่วมกันในหน้ารายงาน */
export default function ReportChart({ labels, series, stacked, height = 260, showLegend = true, highlightIndex, highlightColor = '#e11d48', showValues, horizontal, printTable = 'sum', printCategory }: ReportChartProps) {
  const datasets = series.map(s => {
    const isLine = s.type === 'line';
    const barColors = !isLine && highlightIndex !== undefined
      ? s.data.map((_, i) => (i === highlightIndex ? highlightColor : s.color))
      : s.color;
    return {
      type: (isLine ? 'line' : 'bar') as 'bar',
      label: s.label,
      data: s.data,
      borderColor: s.color,
      backgroundColor: isLine ? (s.fill ? `${s.color}1f` : s.color) : barColors,
      pointBackgroundColor: s.color,
      pointRadius: isLine ? (s.dashed ? 2 : 3.5) : 0,
      borderWidth: isLine ? (s.dashed ? 1.8 : 2.5) : 0,
      borderDash: s.dashed ? [5, 4] : undefined,
      tension: 0.35,
      fill: isLine && s.fill,
      borderRadius: isLine ? 0 : 4,
      maxBarThickness: 34,
      order: isLine ? 0 : 1,
    };
  });

  const valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw(chart: ChartJS) {
      if (!showValues) return;
      const { ctx } = chart;
      ctx.save();
      ctx.font = '600 11px "IBM Plex Sans Thai", sans-serif';
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'center';

      if (horizontal) {
        // ตัวเลขกลางแท่ง (ถ้าแท่งกว้างพอ) + ยอดรวมท้ายแท่ง
        ctx.textBaseline = 'middle';
        const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.data[i] ?? 0), 0));
        chart.data.datasets.forEach((dataset, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((bar, i) => {
            const { x, base, y } = bar.getProps(['x', 'base', 'y'], true) as { x: number; base: number; y: number };
            if (Math.abs(x - base) < 34 || dataset.data[i] == null) return;
            ctx.fillStyle = '#fff';
            ctx.fillText((dataset.data[i] as number).toLocaleString('en-US'), (x + base) / 2, y);
          });
        });
        const lastMeta = chart.getDatasetMeta(chart.data.datasets.length - 1);
        ctx.fillStyle = '#1e1b3a';
        ctx.textAlign = 'left';
        lastMeta.data.forEach((bar, i) => {
          const xPixel = chart.scales.x.getPixelForValue(stacked ? totals[i] : (series[series.length - 1].data[i] ?? 0));
          ctx.fillText(totals[i].toLocaleString('en-US'), xPixel + 6, bar.y);
        });
        ctx.restore();
        return;
      }

      chart.data.datasets.forEach((dataset, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.type !== 'bar' || meta.hidden) return;
        meta.data.forEach((bar, i) => {
          const value = dataset.data[i] as number | null;
          if (value == null) return;
          ctx.fillText(value.toLocaleString('en-US'), bar.x, bar.y - 5);
        });
      });
      ctx.restore();
    },
  };

  return (
    <div className="report-chart" style={{ height }} data-print-table={printTable} data-print-category={printCategory}>
      <Chart
        type="bar"
        data={{ labels, datasets }}
        plugins={[valueLabels]}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          indexAxis: horizontal ? 'y' : 'x',
          layout: { padding: { top: showValues && !horizontal ? 16 : 0, right: showValues && horizontal ? 48 : 0 } },
          plugins: {
            legend: { display: showLegend, position: 'top', labels: { boxWidth: 12, boxHeight: 10, color: '#475569', font: { size: 12 } } },
          },
          scales: horizontal
            ? {
                x: { stacked, beginAtZero: true, grid: { color: '#eef2f7' }, border: { display: false }, ticks: { color: '#64748b', font: { size: 11 }, precision: 0 } },
                y: { stacked, grid: { display: false }, ticks: { color: '#334155', font: { size: 12, weight: 600 } } },
              }
            : {
                x: { stacked, grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
                y: { stacked, beginAtZero: true, grid: { color: '#eef2f7' }, border: { display: false }, ticks: { color: '#64748b', font: { size: 11 }, precision: 0 } },
              },
        }}
      />
    </div>
  );
}
