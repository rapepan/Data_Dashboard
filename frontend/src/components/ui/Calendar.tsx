import type { ChangeEvent, ComponentProps } from 'react';
import { DayPicker, type DropdownProps } from 'react-day-picker';
import { th } from 'react-day-picker/locale';
import 'react-day-picker/style.css';
import Select from './Select';

/** Dropdown เดือน/ปีในหัวปฏิทิน — ใช้ Select ตัวเดียวกับทั้งระบบแทน <select> ธรรมดา */
function CalendarDropdown({ options = [], value, onChange, disabled, 'aria-label': ariaLabel }: DropdownProps) {
  return (
    <Select<number>
      size="sm"
      className="calendar-dropdown"
      ariaLabel={ariaLabel}
      disabled={disabled}
      value={Number(value)}
      options={options}
      // react-day-picker รอ onChange แบบ native <select> (event.target.value) เลยต้องจำลอง event ให้
      onChange={next => onChange?.({ target: { value: String(next) } } as ChangeEvent<HTMLSelectElement>)}
    />
  );
}

/** ปฏิทินภาษาไทย ปี พ.ศ. — พอร์ตมาจากระบบรายงานกายภาพ */
export default function Calendar(props: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={th}
      showOutsideDays
      captionLayout="dropdown"
      className="ui-calendar"
      formatters={{
        formatMonthDropdown: date => date.toLocaleString('th-TH', { month: 'short' }),
        // react-day-picker ใช้ date.getFullYear() ตรง ๆ ไม่รู้จักปี พ.ศ. ต้อง +543 เอง
        formatYearDropdown: date => String(date.getFullYear() + 543),
      }}
      components={{
        Dropdown: CalendarDropdown,
        Chevron: ({ orientation }) => (
          <i className={`fa-solid fa-chevron-${orientation === 'left' ? 'left' : orientation === 'right' ? 'right' : 'down'}`} />
        ),
      }}
      {...props}
    />
  );
}
