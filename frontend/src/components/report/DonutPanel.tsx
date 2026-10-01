import type { ReactNode } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import type { LabelValue } from '../../types/reports';

ChartJS.register(ArcElement, Tooltip);

interface DonutPanelProps {
  items: LabelValue[];
  colors: string[];
  /** ข้อความกลางวง (ค่าเริ่มต้น = ผลรวม + "ราย") */
  center?: ReactNode;
  /** แสดงค่าเป็น % อยู่แล้ว (เช่น สัดส่วนตามสิทธิ์) — ไม่ต้องคำนวณ % ซ้ำ */
  valuesArePercent?: boolean;
  size?: number;
  legendPosition?: 'right' | 'bottom';
  /** หัวคอลัมน์ตัวเลขในตารางที่พิมพ์ */
  valueLabel?: string;
  /** หัวคอลัมน์แรกในตารางที่พิมพ์ */
  printCategory?: string;
}

/** กราฟโดนัทพร้อมตัวเลขกลางวง และคำอธิบาย (จำนวน + %) */
export default function DonutPanel({ items, colors, center, valuesArePercent, size = 170, legendPosition = 'right', valueLabel, printCategory }: DonutPanelProps) {
  const total = items.reduce((sum, i) => sum + i.value, 0) || 1;

  return (
    <div className={`donut-panel legend-${legendPosition}`} data-print-table={valuesArePercent ? 'plain' : 'sum'} data-print-category={printCategory}>
      <div className="donut-box" style={{ width: size, height: size }}>
        <Doughnut
          data={{ labels: items.map(i => i.label), datasets: [{ label: valueLabel ?? (valuesArePercent ? 'สัดส่วน (%)' : 'จำนวน'), data: items.map(i => i.value), backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] }}
          options={{ maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } }}
        />
        <div className="donut-center">
          {center ?? <><b>{total.toLocaleString('en-US')}</b><small>ราย</small></>}
        </div>
      </div>
      <ul className="donut-legend-list">
        {items.map((item, i) => (
          <li key={item.label}>
            <span className="legend-dot" style={{ background: colors[i] }} />
            <span className="legend-name">{item.label}</span>
            <b>{valuesArePercent ? `${item.value}%` : item.value.toLocaleString('en-US')}</b>
            {!valuesArePercent && <small>({((item.value / total) * 100).toFixed(1)}%)</small>}
          </li>
        ))}
      </ul>
    </div>
  );
}
