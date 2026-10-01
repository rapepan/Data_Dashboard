import Select from '../ui/Select';

/** ตัวเลือกจำนวนอันดับที่แสดง — ใช้เหมือนกันทุกตารางอันดับในระบบ */
const TOP_LIMITS = [10, 20, 50].map(n => ({ value: n, label: `Top ${n}` }));

export default function TopLimitSelect({ value, onChange }: { value: number; onChange: (limit: number) => void }) {
  return (
    <>
      <span className="table-tools-label">แสดงอันดับ:</span>
      <Select<number> size="sm" ariaLabel="จำนวนอันดับที่แสดง" value={value} options={TOP_LIMITS} onChange={onChange} />
    </>
  );
}
