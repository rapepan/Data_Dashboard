import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import Calendar from './Calendar';
import { parseIsoDate, toIsoDate } from '../../utils/format';

interface DatePickerProps {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  /** วันที่เลือกได้เร็ว/ช้าสุด (ISO) */
  min?: string;
  max?: string;
  invalid?: boolean;
  /** ปุ่มลัดใต้ปฏิทิน — ค่าเริ่มต้น "วันนี้" (เปลี่ยนได้เมื่อวันนี้อยู่นอกช่วงที่เลือกได้ เช่น "พรุ่งนี้") */
  quickPick?: { label: string; value: string };
}

/** "2026-09-23" -> "23/09/2569" */
function formatThai(iso: string) {
  return parseIsoDate(iso).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** ปุ่มเลือกวันที่ + ปฏิทินเด้ง — แบบเดียวกับ SingleDatePicker ของระบบรายงานกายภาพ */
export default function DatePicker({ value, onChange, placeholder = 'เลือกวันที่', min, max, invalid, quickPick }: DatePickerProps) {
  const quick = quickPick ?? { label: 'วันนี้', value: toIsoDate(new Date()) };
  const [open, setOpen] = useState(false);
  const selected = value ? parseIsoDate(value) : undefined;
  const disabled = [
    ...(min ? [{ before: parseIsoDate(min) }] : []),
    ...(max ? [{ after: parseIsoDate(max) }] : []),
  ];

  const pick = (iso: string) => { onChange(iso); setOpen(false); };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={`date-trigger${invalid ? ' invalid' : ''}`}>
        <i className="fa-solid fa-calendar-days" />
        {value ? formatThai(value) : <span className="placeholder-text">{placeholder}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="ui-popover-positioner" sideOffset={6} align="start">
          <Popover.Popup className="ui-popover">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              disabled={disabled}
              startMonth={new Date(2015, 0)}
              endMonth={new Date(new Date().getFullYear() + 1, 11)}
              onSelect={date => { if (date) pick(toIsoDate(date)); }}
            />
            <div className="ui-popover-foot">
              <button type="button" onClick={() => pick(quick.value)}>{quick.label}</button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
