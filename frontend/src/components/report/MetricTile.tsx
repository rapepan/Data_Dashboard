import type { ReactNode } from 'react';
import type { Metric } from '../../types/reports';
import type { Accent } from '../StatCard';

interface MetricTileProps {
  accent: Accent;
  icon: string;
  label: string;
  metric: Metric;
  unit?: string;
  /** แสดงค่าแบบกำหนดเอง (เช่น 4.6 / 5) แทน metric.value */
  display?: ReactNode;
  /** up = ค่ามากขึ้นเป็นเรื่องดี (จำนวนผู้ป่วย), down = ค่าน้อยลงเป็นเรื่องดี (เวลารอ) */
  goodWhen?: 'up' | 'down';
  compareLabel?: string;
}

/** การ์ด KPI เล็ก: ตัวเลข + ลูกศรเปลี่ยนแปลงเทียบช่วงก่อน (สีบอกว่าดีขึ้นหรือแย่ลง) */
export default function MetricTile({ accent, icon, label, metric, unit, display, goodWhen = 'up', compareLabel = 'vs. ช่วงก่อน' }: MetricTileProps) {
  const hasChange = metric.change !== undefined;
  const up = (metric.change ?? 0) > 0;
  const flat = metric.change === 0;
  const good = flat ? null : (up && goodWhen === 'up') || (!up && goodWhen === 'down');
  const change = metric.changeIsAbsolute ? Math.abs(metric.change ?? 0).toFixed(1) : `${Math.abs(metric.change ?? 0)}%`;

  return (
    <article className="card-box metric-tile" data-accent={accent}>
      <span className="card-icon lg"><i className={`fa-solid ${icon}`} /></span>
      <div className="metric-body">
        <span className="metric-label">{label}</span>
        <span className="metric-value">
          {display ?? metric.value.toLocaleString('en-US')}
          {unit && <small>{unit}</small>}
        </span>
        {hasChange && (
          <span className={`metric-change ${good === null ? 'flat' : good ? 'good' : 'bad'}`}>
            <i className={`fa-solid ${flat ? 'fa-minus' : up ? 'fa-caret-up' : 'fa-caret-down'}`} />
            {change}
            <small>{compareLabel}</small>
          </span>
        )}
      </div>
    </article>
  );
}
