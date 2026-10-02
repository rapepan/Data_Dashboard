import { describe, expect, it } from 'vitest';
import { isNewerVersion } from '../src/utils/version';

describe('isNewerVersion (แจ้งว่ามีเวอร์ชันใหม่)', () => {
  it('server ใหม่กว่า → แจ้ง', () => {
    expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true);
    expect(isNewerVersion('0.10.0', '0.9.0')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.99.9')).toBe(true);
    expect(isNewerVersion('0.1.1', '0.1')).toBe(true);
  });

  it('เท่ากัน หรือ server เก่ากว่า (เช่น ย้อนเวอร์ชัน) → ไม่แจ้ง', () => {
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false);
    expect(isNewerVersion('0.1', '0.1.0')).toBe(false);
  });
});
