import { describe, expect, it } from 'vitest';
import { formatThaiPhone, isThaiPhoneComplete } from '../src/utils/phone';

describe('formatThaiPhone (ใส่ขีดระหว่างพิมพ์)', () => {
  it('ใส่ขีดทีละช่วงตามที่พิมพ์', () => {
    expect(formatThaiPhone('0')).toBe('0');
    expect(formatThaiPhone('098')).toBe('098');
    expect(formatThaiPhone('0987')).toBe('098-7');
    expect(formatThaiPhone('098756')).toBe('098-756');
    expect(formatThaiPhone('0987564785')).toBe('098-756-4785');
  });

  it('เบอร์ 02 ใช้รูปแบบ 2-3-4', () => {
    expect(formatThaiPhone('021234567')).toBe('02-123-4567');
  });

  it('ตัดตัวอักษรอื่นออก และพิมพ์เกินจำนวนหลักไม่ได้', () => {
    expect(formatThaiPhone('098a756b4785')).toBe('098-756-4785');
    expect(formatThaiPhone('09875647851234')).toBe('098-756-4785');
    expect(formatThaiPhone('0212345678')).toBe('02-123-4567');
  });

  it('กดลบจนเหลือขีดท้าย → ขีดหายไปเอง', () => {
    expect(formatThaiPhone('098-')).toBe('098');
  });
});

describe('isThaiPhoneComplete', () => {
  it('ครบ 9–10 หลัก ขึ้นต้นด้วย 0', () => {
    expect(isThaiPhoneComplete('098-756-4785')).toBe(true);
    expect(isThaiPhoneComplete('02-123-4567')).toBe(true);
    expect(isThaiPhoneComplete('098-756')).toBe(false);
    expect(isThaiPhoneComplete('198-756-4785')).toBe(false);
  });
});
