import { useEffect, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';

interface TimePickerProps {
  /** "HH:MM" แบบ 24 ชั่วโมง */
  value: string;
  onChange: (time: string) => void;
  ariaLabel?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

/** "18.30" / "1830" / "8:5" → "18:30" / "18:30" / "08:05" · ไม่ถูกต้อง → null */
function parseTime(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\s*[:.]?\s*(\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * เลือกเวลาแบบ 24 ชั่วโมง — หน้าตาเดียวกับปฏิทิน (DatePicker) ทุกเครื่องเห็นเหมือนกัน
 * เลือกชั่วโมง (00–23) + นาที (ทีละ 5) หรือพิมพ์เวลาเองในช่องด้านบน เช่น 18:20
 */
export default function TimePicker({ value, onChange, ariaLabel = 'เลือกเวลา' }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [hour, minute] = (value || '00:00').split(':');
  const hourList = useRef<HTMLDivElement>(null);
  const minuteList = useRef<HTMLDivElement>(null);

  // เปิดแล้วเลื่อนให้ค่าที่เลือกอยู่กลางรายการ
  useEffect(() => {
    if (!open) return;
    setDraft(value);
    const id = window.setTimeout(() => {
      for (const list of [hourList.current, minuteList.current]) {
        const active = list?.querySelector<HTMLElement>('.active');
        if (list && active) list.scrollTop = active.offsetTop - list.clientHeight / 2 + active.clientHeight / 2;
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, value]);

  const set = (h: string, m: string) => onChange(`${h}:${m}`);
  const commitDraft = () => {
    const parsed = parseTime(draft);
    if (parsed) onChange(parsed);
    else setDraft(value);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="date-trigger time-trigger" aria-label={ariaLabel}>
        <i className="fa-regular fa-clock" />
        {value ? <>{value} <small>น.</small></> : <span className="placeholder-text">--:--</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="ui-popover-positioner" sideOffset={6} align="start">
          <Popover.Popup className="ui-popover time-popover">
            <label className="time-input">
              <i className="fa-regular fa-keyboard" />
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commitDraft}
                onKeyDown={e => { if (e.key === 'Enter') { commitDraft(); setOpen(false); } }}
                placeholder="เช่น 18:30"
                aria-label="พิมพ์เวลา (24 ชั่วโมง)"
                inputMode="numeric"
              />
              <small>น.</small>
            </label>
            <div className="time-columns">
              <div>
                <span className="time-col-label">ชั่วโมง</span>
                <div className="time-list" ref={hourList}>
                  {HOURS.map(h => (
                    <button type="button" key={h} className={h === hour ? 'active' : ''} onClick={() => set(h, minute)}>{h}</button>
                  ))}
                </div>
              </div>
              <span className="time-colon">:</span>
              <div>
                <span className="time-col-label">นาที</span>
                <div className="time-list" ref={minuteList}>
                  {MINUTES.map(m => (
                    <button type="button" key={m} className={m === minute ? 'active' : ''} onClick={() => set(hour, m)}>{m}</button>
                  ))}
                  {!MINUTES.includes(minute) && <button type="button" className="active">{minute}</button>}
                </div>
              </div>
            </div>
            <div className="ui-popover-foot">
              <button type="button" onClick={() => setOpen(false)}>ตกลง</button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
