import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import PageSkeleton from '../../components/PageSkeleton';
import { useMinDelay } from '../../hooks/useMinDelay';
import { ApiError } from '../../services/apiClient';
import { adminService, type CacheStatus } from '../../services/adminService';
import { toast } from '../../utils/toast';

function formatTime(iso: string | null | undefined) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const REASON: Record<string, string> = { schedule: 'ตามรอบอัตโนมัติ', startup: 'เปิดเซิร์ฟเวอร์', manual: 'ผู้ดูแลสั่ง' };

/** ผู้ดูแลระบบ: สถานะการดึงข้อมูล (ที่พักผล + รอบเตรียมข้อมูลล่วงหน้า) */
export default function DataStatusPage() {
  const [status, setStatus] = useState<CacheStatus | null>(null);
  const skeletonDone = useMinDelay();

  const load = useCallback(async () => {
    try {
      setStatus(await adminService.cacheStatus());
    } catch { /* 401/403 จัดการโดยระบบ login */ }
  }, []);

  // ระหว่างกำลังดึงข้อมูล อัปเดตหน้าทุก 3 วินาที
  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, status?.prewarm.running ? 3_000 : 30_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [load, status?.prewarm.running]);

  const refresh = async () => {
    try {
      await adminService.cacheRefresh();
      toast('เริ่มดึงข้อมูลใหม่ทุกรายงานแล้ว', 'success');
      void load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'สั่งดึงข้อมูลไม่สำเร็จ', 'error');
    }
  };

  const p = status?.prewarm;
  const c = status?.cache;

  return (
    <>
      <PageHeader
        title="สถานะข้อมูล"
        subtitle="การดึงข้อมูลจาก HOSxP มาเตรียมไว้ล่วงหน้า และผลที่พักไว้ให้ผู้ใช้ — ผู้ใช้เปิดหน้าไม่ทำให้ HOSxP ถูก query ซ้ำ"
        actions={
          <button className="btn-primary data-refresh" onClick={() => { void refresh(); }} disabled={!status || p?.running}>
            <i className={`fa-solid ${p?.running ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`} />
            {p?.running ? `กำลังดึงข้อมูล (${p.current?.done ?? 0} ชุด)` : 'ดึงข้อมูลใหม่ตอนนี้'}
          </button>
        }
      />

      {!(status && skeletonDone) && <PageSkeleton cards={4} rows={[]} table={8} columns={5} />}
      {skeletonDone && status && p && c && (
        <>
          <section className="grid-4">
            <article className="card-box ds-tile">
              <span>รอบล่าสุด</span>
              <b>{formatTime(p.last?.finishedAt)}</b>
              <small>{p.last ? `${REASON[p.last.reason] ?? p.last.reason} · ${p.last.jobs.length} ชุด · ${((p.last.durationMs ?? 0) / 1000).toFixed(1)} วินาที` : 'ยังไม่มีรอบที่เสร็จ'}</small>
            </article>
            <article className="card-box ds-tile">
              <span>รอบถัดไป</span>
              <b>{formatTime(p.nextAt)}</b>
              <small>อัตโนมัติทุก {p.intervalMinutes} นาที</small>
            </article>
            <article className={`card-box ds-tile${p.consecutiveFailedRuns ? ' bad' : ''}`}>
              <span>ผลรอบล่าสุด</span>
              <b>{p.last ? (p.last.failed ? `ล้ม ${p.last.failed} ชุด` : 'สำเร็จทั้งหมด') : '–'}</b>
              <small>{p.consecutiveFailedRuns ? `ล้มติดกัน ${p.consecutiveFailedRuns} รอบ (แจ้ง Telegram เมื่อครบ 2 รอบ)` : 'ไม่มีรอบที่ล้ม'}</small>
            </article>
            <article className="card-box ds-tile">
              <span>ใช้ผลที่พักไว้ (ตั้งแต่เปิดเซิร์ฟเวอร์)</span>
              <b>{c.stats.hitRate === null ? '–' : `${c.stats.hitRate}%`}</b>
              <small>พักไว้ {c.entries} ชุด · โหลดใหม่เฉลี่ย {c.stats.avgLoadMs ?? '–'} ms · รวมคำขอซ้ำ {c.stats.coalesced} ครั้ง</small>
            </article>
          </section>

          <article className="card-box table-card mb-row">
            <div className="table-card-head">
              <div>
                <strong><i className="fa-solid fa-database" /> รายงานทั้งหมด</strong>
                <small>ผลพักไว้ {c.config.ttlTodayMinutes} นาที (ช่วงที่รวมวันนี้) · {c.config.ttlPastHours} ชั่วโมง (ช่วงในอดีต) · query HOSxP พร้อมกันสูงสุด {c.config.maxConcurrent}</small>
              </div>
            </div>
            <div className="table-responsive">
              <table className="rank-table ds-table">
                <thead>
                  <tr><th>รายงาน</th><th>แหล่งข้อมูล</th><th>เตรียมล่วงหน้า</th><th className="num">ชุดที่พักไว้ (ยังสด)</th><th>ดึงล่าสุด</th></tr>
                </thead>
                <tbody>
                  {status.reports.map(r => (
                    <tr key={r.name}>
                      <td>{r.label}</td>
                      <td><span className={`action-badge tone-${r.source === 'hosxp' ? 'indigo' : 'amber'}`}>{r.source === 'hosxp' ? 'HOSxP จริง' : 'ข้อมูลจำลอง'}</span></td>
                      <td>{r.prewarm ? <><i className="fa-solid fa-check" /> ใช่</> : <span className="muted">เมื่อมีคนเปิด</span>}</td>
                      <td className="num">{r.entries} ({r.fresh})</td>
                      <td className="nowrap">{formatTime(r.newest)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          {p.last && (
            <article className="card-box table-card">
              <div className="table-card-head">
                <div>
                  <strong><i className="fa-solid fa-list-check" /> รายการในรอบล่าสุด</strong>
                  <small>{REASON[p.last.reason] ?? p.last.reason} · เริ่ม {formatTime(p.last.startedAt)} · เรียงตามเวลาที่ใช้ (ช้าสุดก่อน)</small>
                </div>
              </div>
              <div className="table-responsive">
                <table className="rank-table ds-table">
                  <thead><tr><th>รายงาน</th><th>ช่วงข้อมูล</th><th className="num">เวลาที่ใช้</th><th>ผล</th></tr></thead>
                  <tbody>
                    {[...p.last.jobs].sort((a, b) => b.ms - a.ms).map((j, i) => (
                      <tr key={i}>
                        <td>{j.label}</td>
                        <td className="muted">{j.params}</td>
                        <td className={`num${j.ms >= 1000 ? ' slow' : ''}`}>{j.ms.toLocaleString()} ms</td>
                        <td>{j.ok ? <span className="action-badge tone-indigo">สำเร็จ</span> : <span className="action-badge tone-rose" data-tip={j.error}>ล้ม</span>}</td>
                      </tr>
                    ))}
                    {p.last.jobs.length === 0 && <tr><td colSpan={4} className="empty">รอบนี้ไม่มีรายการที่ต้องดึง (ผลที่พักไว้ยังสดอยู่)</td></tr>}
                  </tbody>
                </table>
              </div>
            </article>
          )}
        </>
      )}
    </>
  );
}
