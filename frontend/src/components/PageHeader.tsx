import type { ReactNode } from 'react';
import type { ReportMeta } from '../types/reports';
import DataAsOf from './DataAsOf';

interface PageHeaderProps {
  title: string;
  subtitle: ReactNode;
  actions?: ReactNode;
  /** ข้อมูลกำกับของรายงาน — แสดงป้าย "ข้อมูล ณ ..." */
  meta?: ReportMeta;
}

export default function PageHeader({ title, subtitle, actions, meta }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <DataAsOf meta={meta} />
      </div>
      {actions}
    </div>
  );
}
