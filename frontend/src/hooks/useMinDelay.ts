import { useEffect, useState } from 'react';

/** เวลาแสดง Skeleton ขั้นต่ำตอนเข้าหน้า — ข้อมูลมาเร็วแค่ไหนก็เห็นการโหลดทุกครั้งที่เปลี่ยนหน้า */
export const SKELETON_MIN_MS = 450;

/** false จนกว่าจะผ่านไป ms หลังจาก component ถูกสร้าง (เข้าหน้า) */
export function useMinDelay(ms = SKELETON_MIN_MS) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return done;
}
