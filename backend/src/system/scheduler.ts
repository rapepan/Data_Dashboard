import { auditLog } from '../auth/audit-log';
import { logger } from '../utils/logger';
import { systemStore, type SystemNotice } from './system-store';
import { systemEvents } from './events';

/**
 * เปิด/ปิดโหมดปิดปรับปรุงอัตโนมัติตามประกาศที่ติ๊ก "อัตโนมัติ" ไว้ — ตรวจทุก 30 วินาที และทันทีหลังแก้/ลบประกาศ
 * - ถึงเวลาเริ่ม: เปิดโหมด (ครั้งเดียวต่อการตั้งเวลา — ผู้ดูแลกดปิดก่อนเวลา ระบบไม่เปิดซ้ำ) · ผู้ดูแลเปิดโหมดเองอยู่แล้วไม่แตะ
 * - ระหว่างเปิด: ผู้ดูแลแก้เวลาจบ → ข้อความในหน้าปิดปรับปรุงเปลี่ยนตาม
 * - ปิดโหมดเอง (เฉพาะที่ระบบเปิดให้): หมดเวลา · แก้เวลาจนไม่ครอบคลุมตอนนี้ · เอาติ๊กอัตโนมัติออก · ลบประกาศ
 * - ผู้ดูแลเปิดโหมดเอง / ปิดเฉพาะหน้า แล้วตั้งเวลาไว้ → ถึงเวลาแล้วปิดโหมด / เปิดทุกหน้ากลับให้
 */
const AUTO_BY = 'อัตโนมัติ';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' });
const autoMessage = (n: SystemNotice) => `ปิดปรับปรุงตามกำหนด ถึง ${hhmm(n.maintenanceEnd!)} น.`;

async function turnOff(detail: string) {
  await systemStore.setMaintenance(false, '', AUTO_BY);
  auditLog.write({ loginname: AUTO_BY, action: 'maintenance_off', detail });
  logger.warn(`[system] ปิดโหมดปิดปรับปรุงอัตโนมัติ — ${detail}`);
}

/** ปิดปรับปรุงเฉพาะหน้าที่ตั้งเวลาเปิดกลับไว้ — ถึงเวลาแล้วเปิดทุกหน้ากลับ */
async function reopenPages(t: number) {
  const pages = systemStore.pageMaintenance();
  if (!pages.pages.length || !pages.until || t < Date.parse(pages.until)) return;
  await systemStore.setPageMaintenance([], '', AUTO_BY);
  const detail = `เปิดทุกหน้ากลับตามเวลาที่ตั้งไว้ ${hhmm(pages.until)} น. (${pages.pages.join(', ')})`;
  auditLog.write({ loginname: AUTO_BY, action: 'page_maintenance', detail });
  logger.warn(`[system] ${detail}`);
}

export const systemScheduler = {
  async tick(now = new Date()) {
    const t = now.getTime();
    await reopenPages(t);
    const notices = await systemStore.listNotices();
    const current = systemStore.maintenance();

    // โหมดที่ระบบเปิดให้ประกาศหนึ่ง — ตรวจว่ายังควรเปิดอยู่ไหม
    if (current.on && current.auto !== null) {
      const owner = notices.find(n => n.id === current.auto);
      const start = owner?.maintenanceStart ? Date.parse(owner.maintenanceStart) : NaN;
      const end = owner?.maintenanceEnd ? Date.parse(owner.maintenanceEnd) : NaN;
      if (!owner) return turnOff(`ประกาศ #${current.auto} ถูกลบ`);
      if (!owner.autoMaintenance || Number.isNaN(start) || Number.isNaN(end)) return turnOff(`ประกาศ #${owner.id} ไม่ได้ตั้งเวลาอัตโนมัติแล้ว`);
      if (t >= end) return turnOff(`หมดเวลาตามประกาศ #${owner.id}`);
      if (t < start) return turnOff(`ประกาศ #${owner.id} เลื่อนเวลาเริ่มออกไป`);
      // แก้เวลาจบระหว่างปิดปรับปรุง → ข้อความถึงผู้ใช้เปลี่ยนตาม (เวลาเริ่มของโหมดคงเดิม)
      if (current.message !== autoMessage(owner)) await systemStore.updateMaintenanceMessage(autoMessage(owner));
      return;
    }
    // ผู้ดูแลเปิดเอง — ปิดให้เฉพาะเมื่อตั้งเวลาไว้และถึงเวลาแล้ว
    if (current.on) {
      if (current.until && t >= Date.parse(current.until)) await turnOff(`ถึงเวลาที่ตั้งไว้ ${hhmm(current.until)} น.`);
      return;
    }

    for (const n of notices) {
      if (!n.autoMaintenance || !n.maintenanceStart || !n.maintenanceEnd || n.autoStartedAt) continue;
      if (t >= Date.parse(n.maintenanceStart) && t < Date.parse(n.maintenanceEnd)) {
        const message = autoMessage(n);
        await systemStore.setMaintenance(true, message, AUTO_BY, n.id);
        await systemStore.markAutoStarted(n.id);
        auditLog.write({ loginname: AUTO_BY, action: 'maintenance_on', detail: `ตามประกาศ #${n.id} · ${message}` });
        logger.warn(`[system] เปิดโหมดปิดปรับปรุงอัตโนมัติ ตามประกาศ #${n.id} (ถึง ${hhmm(n.maintenanceEnd)} น.)`);
        return;
      }
    }
  },

  /**
   * ตรวจทันที + ส่งสถานะใหม่ทางช่องสัญญาณสด + นัดตรวจครั้งถัดไปตรงเวลาเหตุการณ์ถัดไป
   * เรียกหลังผู้ดูแลแก้/ลบประกาศ และทุกรอบสำรอง 30 วินาที
   */
  checkNow() {
    systemScheduler.tick()
      .then(() => {
        systemEvents.changed();
        return systemScheduler.scheduleNext();
      })
      .catch(error => logger.warn(`[system] ตรวจเวลาปิดปรับปรุงอัตโนมัติไม่สำเร็จ — ${(error as Error).message}`));
  },

  /**
   * ตั้งเวลาให้ทำงานตรงเวลาเหตุการณ์ถัดไปพอดี — เริ่ม/จบปิดปรับปรุงอัตโนมัติ, ประกาศเริ่ม/เลิกแสดง,
   * เวลาปิดโหมด / เปิดหน้ากลับที่ผู้ดูแลตั้ง
   * (แทนการรอรอบ 30 วินาที → ทุกหน้าเว็บเห็นภายในเสี้ยววินาที)
   */
  async scheduleNext(now = Date.now()) {
    if (nextTimer) clearTimeout(nextTimer);
    nextTimer = null;
    const { until: maintenanceUntil, on } = systemStore.maintenance();
    const { until: pagesUntil, pages } = systemStore.pageMaintenance();
    const times = [
      ...(await systemStore.listNotices()).flatMap(n => [
        n.startsAt, n.endsAt,
        ...(n.autoMaintenance && n.maintenanceStart && n.maintenanceEnd ? [n.maintenanceStart, n.maintenanceEnd] : []),
      ]),
      ...(on && maintenanceUntil ? [maintenanceUntil] : []),
      ...(pages.length && pagesUntil ? [pagesUntil] : []),
    ].map(t => Date.parse(t)).filter(t => t > now);
    if (times.length === 0) return null;
    const next = Math.min(...times);
    // setTimeout รับได้ไม่เกิน ~24.8 วัน — ไกลกว่านั้นให้รอบสำรองตรวจแทน
    const delay = Math.min(next - now + 100, 2 ** 31 - 1);
    nextTimer = setTimeout(() => systemScheduler.checkNow(), delay);
    nextTimer.unref();
    return next;
  },

  start() {
    setTimeout(() => systemScheduler.checkNow(), 3_000).unref();
    // รอบสำรอง: กันเวลาเครื่องเพี้ยน / ตัวตั้งเวลาพลาด · ตรวจเลขเวอร์ชันใหม่ (แก้ package.json) แล้วแจ้งหน้าเว็บ
    setInterval(() => systemScheduler.checkNow(), 30_000).unref();
  },
};

let nextTimer: NodeJS.Timeout | null = null;
