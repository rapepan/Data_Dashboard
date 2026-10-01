import { useRef, type ReactNode } from 'react';
import { printElement } from '../../utils/print';
import { exportPanelExcel } from '../../utils/panelExport';
import ExportButton from '../ExportButton';

interface PanelProps {
  /** เลขลำดับหัวข้อ (1–10) */
  num?: number;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** danger = หัวข้อสีแดง (เช่น Alert & Action) */
  tone?: 'default' | 'danger';
  /** แสดงปุ่มส่งออกเฉพาะกล่องนี้: Excel (ข้อมูลตาราง/กราฟตามที่เห็น) + พิมพ์ / PDF */
  printable?: boolean;
  children: ReactNode;
}

/** กล่องหัวข้อ (มีเลขลำดับได้) ใช้ในหน้ารายงาน */
export default function Panel({ num, title, subtitle, actions, className, tone = 'default', printable, children }: PanelProps) {
  const ref = useRef<HTMLElement>(null);

  return (
    <article ref={ref} className={`card-box panel${tone === 'danger' ? ' panel-danger' : ''}${className ? ` ${className}` : ''}`}>
      <header className="panel-head">
        {num !== undefined && <span className="panel-num">{num}</span>}
        <div className="panel-title">
          <strong><i className="fa-solid fa-chart-column print-only" />{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </div>
        {(actions || printable) && (
          <div className="panel-actions no-print">
            {actions}
            {printable && <ExportButton kind="excel" detail={`${title}.xlsx`} onRun={async () => { if (ref.current) await exportPanelExcel(ref.current, title); }} />}
            {printable && <ExportButton kind="pdf" detail={title} onRun={() => { if (ref.current) printElement(ref.current, title); }} />}
          </div>
        )}
      </header>
      <div className="panel-body">{children}</div>
    </article>
  );
}
