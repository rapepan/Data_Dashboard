import { describe, expect, it } from 'vitest';
import { normalizeThaiPhone } from '../src/utils/phone';

describe('normalizeThaiPhone', () => {
  it('มือถือ 10 หลัก → 3-3-4 ไม่ว่าจะพิมพ์แบบไหน', () => {
    expect(normalizeThaiPhone('0987564785')).toBe('098-756-4785');
    expect(normalizeThaiPhone('098 756 4785')).toBe('098-756-4785');
    expect(normalizeThaiPhone('098-756-4785')).toBe('098-756-4785');
  });

  it('เบอร์ 02 (9 หลัก) → 2-3-4', () => {
    expect(normalizeThaiPhone('021234567')).toBe('02-123-4567');
  });

  it('เบอร์บ้านต่างจังหวัด 9 หลัก → 3-3-3', () => {
    expect(normalizeThaiPhone('038123456')).toBe('038-123-456');
  });

  it('ไม่ใช่เบอร์ไทยที่ถูกต้อง → null', () => {
    expect(normalizeThaiPhone('098756')).toBeNull();
    expect(normalizeThaiPhone('1234567890')).toBeNull();
    expect(normalizeThaiPhone('+66987564785')).toBeNull();
    expect(normalizeThaiPhone('')).toBeNull();
  });
});
