/**
 * จัดรูปแบบเบอร์โทรไทยขณะพิมพ์ — เก็บเฉพาะตัวเลข แล้วใส่ขีดให้เป็นรูปแบบเดียวกัน
 * - ขึ้นต้น 02 (กรุงเทพฯ/ปริมณฑล 9 หลัก): 02-123-4567
 * - อื่น ๆ (มือถือ 10 หลัก / ต่างจังหวัด 9 หลัก): 098-756-4785 · 038-123-456
 */
export function formatThaiPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('02')) {
    const d = digits.slice(0, 9);
    return [d.slice(0, 2), d.slice(2, 5), d.slice(5)].filter(Boolean).join('-');
  }
  const d = digits.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join('-');
}

/** เบอร์ครบหลักหรือยัง (9–10 หลัก ขึ้นต้นด้วย 0) */
export function isThaiPhoneComplete(input: string): boolean {
  return /^0\d{8,9}$/.test(input.replace(/\D/g, ''));
}
