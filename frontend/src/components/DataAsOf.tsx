import { useEffect, useState } from 'react';
import type { ReportMeta } from '../types/reports';

/** ข้อมูลเก่ากว่านี้ (นาที) ขึ้นป้ายเตือน — เตรียมข้อมูลทุก 30 นาที จึงเผื่อไว้ 2 รอบ */
const STALE_AFTER_MINUTES = 60;

function formatAsOf(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time} น.`;
}

/** ป้าย "ข้อมูล ณ ..." ใต้หัวข้อหน้า — บอกว่าตัวเลขสดแค่ไหน และเตือนถ้าข้อมูลเก่า */
export default function DataAsOf({ meta }: { meta?: ReportMeta }) {
  // นาฬิกาทุก 1 นาที — เปิดหน้าค้างไว้นาน ป้ายจะเปลี่ยนเป็น "ข้อมูลอาจไม่เป็นปัจจุบัน" เอง
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!meta) return null;
  const ageMinutes = (now - new Date(meta.asOf).getTime()) / 60_000;
  const outdated = meta.stale || ageMinutes > STALE_AFTER_MINUTES;

  return (
    <span className={`data-asof${outdated ? ' outdated' : ''}`} data-tip={outdated
      ? 'ดึงข้อมูลรอบล่าสุดไม่สำเร็จ กำลังแสดงข้อมูลชุดเดิม'
      : 'ระบบดึงข้อมูลใหม่อัตโนมัติทุก 30 นาที'}>
      <i className={`fa-solid ${outdated ? 'fa-triangle-exclamation' : 'fa-clock-rotate-left'}`} />
      ข้อมูล ณ {formatAsOf(meta.asOf)}
      {outdated && <b> · ข้อมูลอาจไม่เป็นปัจจุบัน</b>}
      {meta.source === 'mock' && <em className="data-source">ข้อมูลจำลอง</em>}
    </span>
  );
}
