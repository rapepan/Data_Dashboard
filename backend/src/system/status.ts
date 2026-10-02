import { systemStore } from './system-store';
import { appVersion } from './version';

/** สถานะระบบที่ทุกคนเห็น — ใช้ทั้ง GET /api/system/status และช่องสัญญาณสด (SSE) */
export async function buildSystemStatus() {
  const maintenance = systemStore.maintenance();
  const pages = systemStore.pageMaintenance();
  const notices = await systemStore.activeNotices().catch(() => []);
  return {
    version: appVersion(),
    maintenance: { on: maintenance.on, message: maintenance.message, since: maintenance.since, until: maintenance.until },
    pageMaintenance: { pages: pages.pages, message: pages.message, until: pages.until },
    notices: notices.map(({ id, message, level, startsAt, endsAt, updatedAt, maintenanceStart, maintenanceEnd }) => (
      { id, message, level, startsAt, endsAt, updatedAt, maintenanceStart, maintenanceEnd })),
  };
}

export type SystemStatus = Awaited<ReturnType<typeof buildSystemStatus>>;
