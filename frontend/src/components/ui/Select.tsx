import { Select as SelectPrimitive } from '@base-ui/react/select';

export interface SelectOption<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SelectProps<T> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Dropdown แบบเดียวกับระบบรายงานกายภาพ (Base UI Select) แต่ใช้ CSS ของระบบนี้ (.ui-select-*)
 * แทน Tailwind/shadcn
 */
export default function Select<T extends string | number>({ value, options, onChange, size = 'md', ariaLabel, className, disabled }: SelectProps<T>) {
  const selected = options.find(option => option.value === value);

  return (
    <SelectPrimitive.Root<T>
      value={value}
      disabled={disabled}
      onValueChange={next => { if (next !== null) onChange(next as T); }}
    >
      <SelectPrimitive.Trigger className={`ui-select-trigger size-${size}${className ? ` ${className}` : ''}`} aria-label={ariaLabel}>
        <SelectPrimitive.Value>{selected?.label}</SelectPrimitive.Value>
        <SelectPrimitive.Icon className="ui-select-icon"><i className="fa-solid fa-chevron-down" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        {/* alignItemWithTrigger=false: ให้เปิดใต้ปุ่มเสมอ (โหมด default คำนวณตำแหน่งผิดเวลาอยู่ใน popover) */}
        <SelectPrimitive.Positioner className="ui-select-positioner" sideOffset={4} alignItemWithTrigger={false}>
          <SelectPrimitive.Popup className="ui-select-popup">
            <SelectPrimitive.ScrollUpArrow className="ui-select-scroll"><i className="fa-solid fa-chevron-up" /></SelectPrimitive.ScrollUpArrow>
            <SelectPrimitive.List>
              {options.map(option => (
                <SelectPrimitive.Item key={String(option.value)} value={option.value} disabled={option.disabled} className="ui-select-item">
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="ui-select-check"><i className="fa-solid fa-check" /></SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
            <SelectPrimitive.ScrollDownArrow className="ui-select-scroll"><i className="fa-solid fa-chevron-down" /></SelectPrimitive.ScrollDownArrow>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
