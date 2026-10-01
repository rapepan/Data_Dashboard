import type { ReactNode } from 'react';

export type Accent = 'indigo' | 'amber' | 'rose' | 'plum' | 'slate';
export type Tone = 'indigo' | 'plum' | 'rose' | 'pink' | 'amber' | 'orange' | 'sky' | 'slate';

export interface StatPart {
  label: string;
  value: number;
  tone: Tone;
  showPct?: boolean;
  display?: string;
}

interface StatCardProps {
  accent: Accent;
  icon: string;
  title: string;
  tooltip: string;
  value: ReactNode;
  changePct?: number;
  parts: StatPart[];
  foot: ReactNode;
}

export default function StatCard({ accent, icon, title, tooltip, value, changePct, parts, foot }: StatCardProps) {
  const change = changePct ?? 0;
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const arrow = change > 0 ? 'fa-arrow-up' : change < 0 ? 'fa-arrow-down' : 'fa-minus';
  const total = parts.reduce((sum, part) => sum + part.value, 0);

  return (
    <article className="card-box stat-card" data-accent={accent}>
      <div className="stat-card-head">
        <span className="stat-title" data-tip={tooltip}>{title}</span>
        <span className="card-icon"><i className={`fa-solid ${icon}`} /></span>
      </div>

      <div className="stat-value-row">
        <span className="stat-value">{value}</span>
        {changePct !== undefined && <span className={`stat-delta ${direction}`}><i className={`fa-solid ${arrow}`} />{Math.abs(change)}%</span>}
      </div>

      <div className="stat-breakdown">
        {parts.map(part => (
          <div key={part.label} className={`breakdown tone-${part.tone}`}>
            <span>
              {part.display ?? part.value.toLocaleString('en-US')}
              {part.showPct && <em> ({total ? Math.round((part.value / total) * 100) : 0}%)</em>}
            </span>
            <small>{part.label}</small>
          </div>
        ))}
      </div>

      <div className="stat-foot">{foot}</div>
    </article>
  );
}
