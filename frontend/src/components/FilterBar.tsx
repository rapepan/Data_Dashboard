import { useEffect, useState } from 'react';
import type { DashboardFilter, FilterMode } from '../types/dashboard';
import { defaultFilter } from '../hooks/useDashboardData';
import { fiscalYear, fiscalYearRange, parseIsoDate } from '../utils/format';
import DatePicker from './ui/DatePicker';
import Select from './ui/Select';

interface FilterBarProps {
  filter: DashboardFilter;
  onApply: (filter: DashboardFilter) => void;
  onRefresh: () => void;
}

const MODES: { key: FilterMode; label: string }[] = [
  { key: 'fiscal', label: 'ปีงบประมาณ' },
  { key: 'range', label: 'กรองระหว่างวัน' },
];

/** ปีงบประมาณปัจจุบันย้อนหลัง 5 ปี */
const CURRENT_FY = fiscalYear(new Date());
const FISCAL_YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_FY - i).map(year => ({ value: year, label: `ปีงบประมาณ ${year}` }));

/** หน่วงเวลาก่อนโหลด เผื่อผู้ใช้แก้วันเริ่มแล้วแก้วันสิ้นสุดต่อทันที จะได้โหลดครั้งเดียว */
const APPLY_DELAY_MS = 400;

export default function FilterBar({ filter, onApply, onRefresh }: FilterBarProps) {
  const [draft, setDraft] = useState(filter);
  const invalid = !draft.start || !draft.end || draft.start > draft.end;

  // เลือกแล้วแสดงผลทันที — ไม่ต้องกดปุ่มกรอง
  useEffect(() => {
    if (invalid) return;
    if (draft.mode === filter.mode && draft.start === filter.start && draft.end === filter.end) return;
    const id = setTimeout(() => onApply(draft), APPLY_DELAY_MS);
    return () => clearTimeout(id);
  }, [draft, filter, invalid, onApply]);

  const setMode = (mode: FilterMode) => setDraft(defaultFilter(mode));
  const setFiscalYear = (year: number) => setDraft({ mode: 'fiscal', ...fiscalYearRange(year) });

  return (
    <div className="filter-bar">
      <div className="segmented">
        {MODES.map(mode => (
          <button key={mode.key} className={draft.mode === mode.key ? 'active' : ''} onClick={() => setMode(mode.key)}>{mode.label}</button>
        ))}
      </div>

      {draft.mode === 'fiscal' ? (
        <div className="filter-field">
          <span>เลือกปีงบประมาณ:</span>
          <Select<number> ariaLabel="เลือกปีงบประมาณ" className="fiscal-select" value={fiscalYear(parseIsoDate(draft.start))} options={FISCAL_YEARS} onChange={setFiscalYear} />
        </div>
      ) : (
        <>
          <div className="filter-field">
            <span>เริ่มต้น:</span>
            <DatePicker value={draft.start} max={draft.end} invalid={invalid} onChange={start => setDraft({ ...draft, start })} />
          </div>
          <div className="filter-field">
            <span>สิ้นสุด:</span>
            <DatePicker value={draft.end} min={draft.start} invalid={invalid} onChange={end => setDraft({ ...draft, end })} />
          </div>
        </>
      )}

      <button className="filter-refresh" onClick={onRefresh} data-tip="รีเฟรชข้อมูล"><i className="fa-solid fa-arrows-rotate" /></button>
    </div>
  );
}
