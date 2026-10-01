import { afterEach, describe, expect, it, vi } from 'vitest';
import { printBlock } from '../src/utils/logger';

/** ความกว้างที่เห็นบนจอ — สระบน/ล่างและวรรณยุกต์ไทยไม่กินที่ */
const visible = (text: string) => text.replace(/[ัิ-ฺ็-๎]/g, '').length;

afterEach(() => vi.restoreAllMocks());

describe('printBlock (กล่องสรุปในเทอร์มินัล)', () => {
  it('หัวข้อภาษาไทยที่มีสระบน/ล่าง เครื่องหมาย ":" ตรงกันเป็นแนวเดียว', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((text: string) => { lines.push(text); });

    printBlock('ทดสอบ', [
      ['HOSxP', 'ok'],
      ['ข้อมูลรายงาน', 'ok'],
      ['ประวัติการใช้งาน', 'ok'],
      ['แจ้งเตือนมือถือ', 'ok'],
    ]);

    const rows = lines.filter(l => l.startsWith('│'));
    expect(rows).toHaveLength(4);
    const colonAt = rows.map(r => visible(r.slice(0, r.indexOf(' : '))));
    expect(new Set(colonAt).size).toBe(1);
  });

  it('แถวที่ค่าเป็น null ไม่แสดง', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((text: string) => { lines.push(text); });
    printBlock('ทดสอบ', [['มี', 'ค่า'], ['ไม่มี', null]]);
    expect(lines.filter(l => l.startsWith('│'))).toEqual(['│ มี : ค่า']);
  });
});
