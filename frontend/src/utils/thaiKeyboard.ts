/** ลืมเปลี่ยนแป้นพิมพ์เป็นภาษาอังกฤษ — ตรวจว่ามีตัวอักษรไทย (ใช้เตือนในหน้า login · ไม่แปลงให้) */
const THAI = /[\u0E00-\u0E7F]/;

export const hasThai = (text: string) => THAI.test(text);

/** สระบน/ล่าง และวรรณยุกต์ — ต้องเกาะพยัญชนะ ถ้าพิมพ์ลอย ๆ จะมองแทบไม่เห็นในช่องกรอก */
const MARK = /[ัิ-ฺ็-๎]/;
const BASE = /[ก-ะาำเ-ๆ]/;

/** แสดงสิ่งที่พิมพ์ให้มองเห็นครบ — สระ/วรรณยุกต์ที่ไม่มีพยัญชนะเกาะ ใส่ ◌ นำหน้า เช่น "ืm0809" → "◌ืm0809" */
export function visibleThai(text: string) {
  const chars = [...text];
  return chars.map((ch, i) => {
    if (!MARK.test(ch)) return ch;
    const prev = chars[i - 1];
    return prev && (BASE.test(prev) || MARK.test(prev)) ? ch : `◌${ch}`;
  }).join('');
}
