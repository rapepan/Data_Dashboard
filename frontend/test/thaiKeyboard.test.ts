import { describe, expect, it } from 'vitest';
import { hasThai, visibleThai } from '../src/utils/thaiKeyboard';

describe('เตือนแป้นพิมพ์ภาษาไทยในหน้า login', () => {
  it('มีตัวอักษรไทย = เตือน · อังกฤษ / ตัวเลข / สัญลักษณ์ = ไม่เตือน', () => {
    expect(hasThai('ืm0809')).toBe(true);
    expect(hasThai('ๆไำพ')).toBe(true);
    expect(hasThai('nm0809')).toBe(false);
    expect(hasThai('Rapepan23!@#')).toBe(false);
  });
});

describe('แสดงสระที่พิมพ์ลอย ๆ ให้มองเห็น', () => {
  it('สระ/วรรณยุกต์ที่ไม่มีพยัญชนะเกาะ ใส่ ◌ นำหน้า · คำไทยปกติไม่เปลี่ยน', () => {
    expect(visibleThai('ืm0809')).toBe('◌ืm0809');
    expect(visibleThai('a่b')).toBe('a◌่b');
    expect(visibleThai('กื้')).toBe('กื้');
    expect(visibleThai('nm0809')).toBe('nm0809');
  });
});
