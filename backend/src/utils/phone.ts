/**
 * เบอร์โทรไทย 9–10 หลัก ขึ้นต้นด้วย 0 → รูปแบบเดียวกันเสมอ (ตรงกับที่หน้าเว็บจัดให้ระหว่างพิมพ์)
 * 02 (กรุงเทพฯ/ปริมณฑล): 02-123-4567 · อื่น ๆ: 098-756-4785 / 038-123-456
 * ไม่ใช่เบอร์ไทยที่ถูกต้อง → null
 */
export function normalizeThaiPhone(input: string): string | null {
  const d = input.replace(/\D/g, '');
  if (!/^0\d{8,9}$/.test(d)) return null;
  return d.startsWith('02') ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}
