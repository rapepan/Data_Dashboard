import type { ReactNode } from 'react';
import type { Accent } from './StatCard';

interface KpiCardProps {
  accent: Accent;
  icon: string;
  title: string;
  value: ReactNode;
  unit?: string;
  /** ป้ายเล็กด้านล่าง เช่น "Count Distinct HN" */
  badge: ReactNode;
  badgeIcon: string;
  note?: ReactNode;
}

/** การ์ดตัวเลขสรุปแบบเรียบ (หัวข้อ + ตัวเลขใหญ่ + ป้ายอธิบายที่มาของตัวเลข) */
export default function KpiCard({ accent, icon, title, value, unit, badge, badgeIcon, note }: KpiCardProps) {
  return (
    <article className="card-box kpi-card" data-accent={accent}>
      <div className="kpi-head">
        <span className="kpi-title">{title}</span>
        <span className="card-icon"><i className={`fa-solid ${icon}`} /></span>
      </div>
      <div className="kpi-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div className="kpi-foot">
        <span className="kpi-badge"><i className={`fa-solid ${badgeIcon}`} />{badge}</span>
        {note && <span>{note}</span>}
      </div>
    </article>
  );
}
