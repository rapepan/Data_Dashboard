import { formatDmy } from '../../utils/format';

/** up = ค่ามากขึ้นเป็นเรื่องดี (จำนวนผู้รับบริการ) · down = น้อยลงดี (เวลารอ, Re-admit) · none = ไม่บอกดี/แย่ (ปริมาณยา) */
export type GoodWhen = 'up' | 'down' | 'none';

interface ChangeBadgeProps {
  change?: number;
  goodWhen?: GoodWhen;
  /** ช่วงก่อนหน้าที่ใช้เทียบ — แสดงเมื่อชี้ที่ป้าย */
  range?: { start: string; end: string };
}

/** ป้าย % เปลี่ยนแปลงเทียบช่วงก่อนหน้า (สีบอกว่าดีขึ้นหรือแย่ลง) — ไม่มีข้อมูลเทียบ = ไม่แสดง */
export default function ChangeBadge({ change, goodWhen = 'up', range }: ChangeBadgeProps) {
  if (change === undefined) return null;
  const flat = change === 0;
  const tone = flat || goodWhen === 'none' ? 'flat' : (change > 0) === (goodWhen === 'up') ? 'good' : 'bad';
  const tip = range ? `เทียบช่วงก่อนหน้า ${formatDmy(range.start)} – ${formatDmy(range.end)}` : undefined;
  return (
    <span className={`metric-change change-badge ${tone}`} data-tip={tip}>
      <i className={`fa-solid ${flat ? 'fa-minus' : change > 0 ? 'fa-caret-up' : 'fa-caret-down'}`} />
      {Math.abs(change)}%
      <small>vs. ช่วงก่อน</small>
    </span>
  );
}
