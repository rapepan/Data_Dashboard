import type { ReactNode } from 'react';
import type { Accent } from './StatCard';

interface InfoCardProps {
  accent: Accent;
  icon: string;
  title: string;
  tooltip: string;
  children: ReactNode;
}

export default function InfoCard({ accent, icon, title, tooltip, children }: InfoCardProps) {
  return (
    <article className="card-box info-card" data-accent={accent}>
      <div className="info-card-head">
        <span className="card-icon round"><i className={`fa-solid ${icon}`} /></span>
        <strong data-tip={tooltip}>{title}</strong>
      </div>
      <div className="info-card-body">{children}</div>
    </article>
  );
}
