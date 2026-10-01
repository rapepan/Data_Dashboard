import { useRef } from 'react';
import ExportButton from '../ExportButton';
import { exportPanelExcel } from '../../utils/panelExport';
import { printElement } from '../../utils/print';

/**
 * ปุ่ม Excel + พิมพ์ / PDF สำหรับกล่องที่ไม่ได้ใช้ Panel (เช่น การ์ดกราฟหน้าแรก)
 * ส่งออกกล่อง .card-box ที่ปุ่มนี้อยู่ข้างใน — excel={false} เมื่อกล่องมีปุ่ม Excel ของตัวเองอยู่แล้ว
 */
export default function ExportPair({ title, excel = true }: { title: string; excel?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const box = () => ref.current?.closest<HTMLElement>('.card-box, .modal-box, [role="dialog"]') ?? null;

  return (
    <span ref={ref} className="export-pair no-print">
      {excel && <ExportButton kind="excel" detail={`${title}.xlsx`} onRun={async () => { const el = box(); if (el) await exportPanelExcel(el, title); }} />}
      <ExportButton kind="pdf" detail={title} onRun={() => { const el = box(); if (el) printElement(el, title); }} />
    </span>
  );
}
