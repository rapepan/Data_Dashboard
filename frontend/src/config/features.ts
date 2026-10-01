/**
 * ส่วนที่ซ่อนไว้ชั่วคราว (ส่วน ก.) — ข้อมูลในฐาน HOSxP ไม่มี หรือมีแต่อ้างอิงไม่ได้ (ตรวจเมื่อ 30/09/2569)
 * โค้ดหน้าเว็บและข้อมูลจำลองใน backend ยังอยู่ครบ — เปลี่ยนเป็น true เพื่อแสดงกลับได้ทันที
 */
export const FEATURES = {
  /** ความพึงพอใจผู้ป่วย (การ์ด + แผง + รายการใน Alert) หน้า OPD / ER — ไม่มีตารางผลประเมินในฐาน */
  satisfaction: false,
  /** ER: การ์ดเวลารอพบแพทย์ + เวลาแต่ละขั้นตอน + ระยะเวลาที่อยู่ใน ER — เวลาในฐานระบบลงอัตโนมัติ (5/10 นาทีทุกครั้ง) */
  erTimes: false,
  /** ER Patient Flow — ไม่มีข้อมูลสถานะแต่ละขั้นของ ER */
  erFlow: false,
  /** ER ทรัพยากรและภาระงาน — ไม่มีข้อมูลการขึ้นเวรรายวัน */
  erResources: false,
  /** ER Alert & Action — เป็นข้อความตายตัว ไม่ได้คำนวณจากข้อมูล */
  erAlerts: false,
  /** IPD Patient Status (รักษาต่อเนื่อง / รอจำหน่าย / รอผลตรวจ / รอปรึกษา) — ช่องสถานะใน ipt ว่างทั้งหมด */
  ipdPatientStatus: false,
  /** IPD Discharge Planning & Turnaround — ไม่มีเวลาที่แพทย์สั่งจำหน่าย */
  ipdDischargePlanning: false,
  /** IPD Alert "รอผลตรวจนานกว่า 24 ชม." — ไม่มีข้อมูลสถานะผลตรวจ */
  ipdLabAlert: false,
} as const;

/** เลขลำดับแผงต่อเนื่องเมื่อซ่อนบางแผง (แผง 1 = แถว KPI) */
export function panelNumbers() {
  let n = 1;
  return () => ++n;
}
