import type { LabelValue } from '../../types/reports';

interface HBarListProps {
  items: LabelValue[];
  /** ค่าเต็มของแถบ (ไม่ระบุ = ค่ามากสุดในรายการ) */
  max?: number;
  color?: string;
  /** เลือกสีรายแถว เช่น แถวที่เกินเป้าเป็นสีแดง */
  colorOf?: (item: LabelValue, index: number) => string | undefined;
  format?: (item: LabelValue) => string;
  /** แสดง % ต่อท้าย (เทียบผลรวม) */
  showShare?: boolean;
  labelWidth?: number;
}

/** รายการแถบแนวนอน: ชื่อ — แถบ — ตัวเลข */
export default function HBarList({ items, max, color = 'var(--primary)', colorOf, format, showShare, labelWidth = 120 }: HBarListProps) {
  const top = max ?? Math.max(1, ...items.map(i => i.value));
  const total = items.reduce((sum, i) => sum + i.value, 0) || 1;

  return (
    <ul className="hbar-list" style={{ ['--label-w' as string]: `${labelWidth}px` }}>
      {items.map((item, i) => (
        <li key={item.label}>
          <span className="hbar-label" data-tip={item.label}>{item.label}</span>
          <span className="hbar-track">
            <span style={{ width: `${Math.min(100, (item.value / top) * 100)}%`, background: colorOf?.(item, i) ?? color }} />
          </span>
          <span className="hbar-value">
            {format ? format(item) : item.value.toLocaleString('en-US')}
            {showShare && <small>{((item.value / total) * 100).toFixed(1)}%</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}
