import type { ReactNode } from 'react';
import type { CountBreakdown, PhysioCount } from '../../types/reports';
import type { Accent } from '../StatCard';
import { formatNumber } from '../../utils/format';

interface CountSummaryCardProps {
  accent: Accent;
  icon: string;
  title: string;
  note: string;
  data: CountBreakdown & { ipd?: PhysioCount; opd?: PhysioCount };
  categories: string[];
  colors: string[];
  /** แสดงแถบสัดส่วน IPD : OPD (ต้องมี data.ipd / data.opd) */
  showSplit?: boolean;
  /** ป้าย % เทียบช่วงก่อน (ChangeBadge) */
  change?: ReactNode;
}

const pct = (part: number, total: number) => (total ? (part / total) * 100 : 0);

/** การ์ดสรุป: คน / ครั้ง รวม + แยกกลุ่ม (ใช้ในหน้ากายภาพบำบัด / แพทย์แผนไทย) */
export default function CountSummaryCard({ accent, icon, title, note, data, categories, colors, showSplit, change }: CountSummaryCardProps) {
  const ipdPct = data.ipd ? pct(data.ipd.visits, data.total.visits) : 0;

  return (
    <article className="card-box dental-card physio-card" data-accent={accent}>
      <div className="dental-card-head">
        <div>
          <span className="dental-card-title">{title}</span>
          <span className="dental-card-value">
            {formatNumber(data.total.persons)} <small>คน</small>
            <span className="slash">/</span>
            <em>{formatNumber(data.total.visits)}</em> <small>ครั้ง</small>
          </span>
          {change && <span className="card-change">{change}</span>}
          <span className="dental-card-note">{note}</span>
        </div>
        <span className="card-icon lg"><i className={`fa-solid ${icon}`} /></span>
      </div>
      <div className={`dental-chips count-chips cols-${categories.length}`}>
        {categories.map((category, i) => (
          <div key={category}>
            <small style={{ color: colors[i] }}>{category}</small>
            <b>{formatNumber(data.categories[i]?.persons ?? 0)}<span>คน</span></b>
            <span className="chip-visits">{formatNumber(data.categories[i]?.visits ?? 0)} ครั้ง</span>
          </div>
        ))}
      </div>
      {showSplit && data.ipd && data.opd && (
        <div className="split-bar">
          <div className="split-labels">
            <span className="ipd"><i className="fa-solid fa-bed-pulse" />IPD: {formatNumber(data.ipd.persons)} คน / {formatNumber(data.ipd.visits)} ครั้ง ({ipdPct.toFixed(1)}%)</span>
            <span className="opd"><i className="fa-solid fa-hospital-user" />OPD: {formatNumber(data.opd.persons)} คน / {formatNumber(data.opd.visits)} ครั้ง ({(100 - ipdPct).toFixed(1)}%)</span>
          </div>
          <div className="split-track"><span style={{ width: `${ipdPct}%` }} /></div>
        </div>
      )}
    </article>
  );
}
