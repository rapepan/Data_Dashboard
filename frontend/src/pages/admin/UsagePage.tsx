import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import PageSkeleton from '../../components/PageSkeleton';
import KpiCard from '../../components/KpiCard';
import Panel from '../../components/report/Panel';
import ReportChart from '../../charts/ReportChart';
import { useMinDelay } from '../../hooks/useMinDelay';
import { NAV_GROUPS } from '../../routes/navigation';
import { fetchUsageSummary, type UsageRange, type UsageSummary } from '../../services/adminService';
import { formatNumber } from '../../utils/format';

const RANGES: { value: UsageRange; label: string }[] = [
  { value: 7, label: '7 วัน' },
  { value: 30, label: '30 วัน' },
  { value: 90, label: '90 วัน' },
];
const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

const pad = (n: number) => String(n).padStart(2, '0');
/** "02/10/2569" */
const dmy = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${Number(y) + 543}`; };
/** "02/10" — ป้ายแกนกราฟรายวัน */
const dm = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
/** "02/10/2569 09:15" ตามเวลาเครื่อง */
function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const peakIndex = (values: number[]) => (values.some(v => v > 0) ? values.indexOf(Math.max(...values)) : undefined);

/** หน้า "สรุปการใช้งาน" (ผู้ดูแล) — ใครใช้หน้าไหน ช่วงเวลาไหน ส่งออกอะไร คำนวณจากประวัติการใช้งาน */
export default function UsagePage() {
  const [days, setDays] = useState<UsageRange>(30);
  const [data, setData] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const skeletonDone = useMinDelay();

  const load = useCallback(async (range: UsageRange) => {
    setLoading(true);
    try { setData(await fetchUsageSummary(range)); } catch { /* 401/403 จัดการโดยระบบ login */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(days); }, [days, load]);

  const hourPeak = data ? peakIndex(data.hourly) : undefined;
  const dayPeak = data ? peakIndex(data.weekday) : undefined;
  const activeDays = data?.daily.filter(d => d.views > 0).length ?? 0;
  const pageTop = Math.max(1, ...(data?.pages.map(p => p.views) ?? [1]));

  return (
    <>
      <PageHeader
        title="สรุปการใช้งาน"
        subtitle={data
          ? <>ช่วง {dmy(new Date(Date.parse(data.from) + 7 * 3_600_000).toISOString())} – {dmy(new Date(Date.parse(data.to) + 7 * 3_600_000).toISOString())} · คำนวณจากประวัติการใช้งาน (ไม่นับบัญชีทดสอบ)</>
          : 'คำนวณจากประวัติการใช้งาน'}
        actions={
          <div className="filter-bar">
            <div className="segmented" role="group" aria-label="ช่วงเวลา">
              {RANGES.map(r => (
                <button key={r.value} type="button" className={days === r.value ? 'active' : ''} onClick={() => setDays(r.value)}>{r.label}</button>
              ))}
            </div>
            <button className="filter-refresh" onClick={() => void load(days)} data-tip="รีเฟรช" disabled={loading}><i className={`fa-solid fa-arrows-rotate${loading ? ' fa-spin' : ''}`} /></button>
          </div>
        }
      />

      {!(data && skeletonDone) ? <PageSkeleton cards={4} rows={[2]} table={6} columns={5} /> : (
        <div className={loading ? 'usage-loading' : undefined}>
          <section className="grid-4">
            <KpiCard
              accent="indigo" icon="fa-eye" title="การเปิดดูหน้า" value={formatNumber(data.totals.views)} unit="ครั้ง"
              badgeIcon="fa-circle-info" badge="คนเดิมเปิดหน้าเดิมภายใน 5 นาที นับครั้งเดียว"
            />
            <KpiCard
              accent="plum" icon="fa-user-check" title="ผู้ใช้ที่ login" value={formatNumber(data.totals.users)} unit="คน"
              badgeIcon="fa-right-to-bracket" badge={`login ${formatNumber(data.totals.logins)} ครั้ง`}
              note={data.totals.loginFailed > 0 ? <span className="usage-warn">รหัสผิด {formatNumber(data.totals.loginFailed)} ครั้ง</span> : undefined}
            />
            <KpiCard
              accent="slate" icon="fa-user-secret" title="ผู้เยี่ยมชม" value={formatNumber(data.totals.guests)} unit="เครื่อง"
              badgeIcon="fa-eye" badge={`เปิดดู ${formatNumber(data.totals.guestViews)} ครั้ง`}
              note="นับตาม IP (ไม่รู้ว่าเป็นใคร)"
            />
            <KpiCard
              accent="amber" icon="fa-file-export" title="ส่งออก Excel / PDF" value={formatNumber(data.totals.exports)} unit="ครั้ง"
              badgeIcon="fa-calendar-check" badge={`มีการใช้งาน ${activeDays} จาก ${data.days} วัน`}
            />
          </section>

          <Panel title="การใช้งานรายวัน" subtitle="จำนวนครั้งที่เปิดดูหน้าในแต่ละวัน แยกผู้ใช้ที่ login กับผู้เยี่ยมชม">
            <ReportChart
              labels={data.daily.map(d => dm(d.date))}
              series={[
                { label: 'ผู้ใช้ที่ login (ครั้ง)', data: data.daily.map(d => d.views - d.guestViews), color: '#4f46e5' },
                { label: 'ผู้เยี่ยมชม (ครั้ง)', data: data.daily.map(d => d.guestViews), color: '#cbd5e1' },
              ]}
              stacked height={260} printCategory="วันที่"
            />
          </Panel>

          <section className="grid-2">
            <Panel
              title="ช่วงเวลาที่ใช้งาน"
              subtitle={hourPeak !== undefined ? <>ใช้งานมากที่สุดช่วง <b>{pad(hourPeak)}:00–{pad(hourPeak)}:59 น.</b></> : 'ยังไม่มีข้อมูล'}
            >
              <ReportChart
                labels={data.hourly.map((_, h) => pad(h))}
                series={[{ label: 'เปิดดู (ครั้ง)', data: data.hourly, color: '#a5b4fc' }]}
                highlightIndex={hourPeak} highlightColor="#4f46e5" showLegend={false} height={230} printCategory="ชั่วโมง"
              />
            </Panel>
            <Panel
              title="วันในสัปดาห์"
              subtitle={dayPeak !== undefined ? <>ใช้งานมากที่สุดวัน<b>{WEEKDAYS[dayPeak]}</b></> : 'ยังไม่มีข้อมูล'}
            >
              <ReportChart
                labels={WEEKDAYS}
                series={[{ label: 'เปิดดู (ครั้ง)', data: data.weekday, color: '#a5b4fc' }]}
                highlightIndex={dayPeak} highlightColor="#4f46e5" showLegend={false} height={230} printCategory="วัน"
              />
            </Panel>
          </section>

          <Panel title="หน้าที่เปิดดูมากที่สุด" subtitle="แยกผู้ใช้ที่ login (นับคน) กับผู้เยี่ยมชม (นับครั้ง)">
            {data.pages.length === 0 ? <p className="muted usage-empty">ยังไม่มีการเปิดดูในช่วงนี้</p> : (
              <div className="table-responsive">
                <table className="rank-table usage-pages">
                  <thead><tr><th>#</th><th>หน้า</th><th className="usage-bar-col">เปิดดู</th><th className="num">ผู้ใช้ (คน)</th><th className="num">ผู้เยี่ยมชม (ครั้ง)</th></tr></thead>
                  <tbody>
                    {data.pages.map((p, i) => {
                      const item = NAV_ITEMS.find(n => n.key === p.key);
                      return (
                        <tr key={p.key}>
                          <td className="muted">{i + 1}</td>
                          <td className="nowrap"><i className={`fa-solid ${item?.icon ?? 'fa-file'} usage-page-icon`} /> {item?.label ?? p.key}</td>
                          <td className="usage-bar-col">
                            <span className="usage-bar"><span style={{ width: `${(p.views / pageTop) * 100}%` }} /></span>
                            <b>{formatNumber(p.views)}</b>
                          </td>
                          <td className="num">{formatNumber(p.users)}</td>
                          <td className="num">{p.guestViews ? formatNumber(p.guestViews) : '–'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <section className="grid-2">
            <Panel title="ผู้ใช้งานมากที่สุด" subtitle="10 อันดับ เรียงตามจำนวนครั้งที่เปิดดู">
              {data.topUsers.length === 0 ? <p className="muted usage-empty">ยังไม่มีผู้ใช้ที่ login ในช่วงนี้</p> : (
                <div className="table-responsive">
                  <table className="rank-table">
                    <thead><tr><th>ผู้ใช้</th><th className="num">เปิดดู</th><th className="num">ส่งออก</th><th>ใช้งานล่าสุด</th></tr></thead>
                    <tbody>
                      {data.topUsers.map(u => (
                        <tr key={u.loginname}>
                          <td className="usage-user"><b>{u.name}</b><small className="muted">{u.loginname}{u.position && ` · ${u.position}`}</small></td>
                          <td className="num">{formatNumber(u.views)}</td>
                          <td className="num">{u.exports ? formatNumber(u.exports) : '–'}</td>
                          <td className="nowrap"><small>{formatDateTime(u.last)}</small></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel title="ส่งออกล่าสุด" subtitle="15 รายการล่าสุด (Excel / พิมพ์ / PDF)">
              {data.recentExports.length === 0 ? <p className="muted usage-empty">ยังไม่มีการส่งออกในช่วงนี้</p> : (
                <div className="table-responsive">
                  <table className="rank-table">
                    <thead><tr><th>เวลา</th><th>ผู้ส่งออก</th><th>ไฟล์</th></tr></thead>
                    <tbody>
                      {data.recentExports.map((e, i) => (
                        <tr key={`${e.time}-${i}`}>
                          <td className="nowrap"><small>{formatDateTime(e.time)}</small></td>
                          <td className="usage-user"><b>{e.name}</b></td>
                          <td><small>{e.detail}</small></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </section>
        </div>
      )}
    </>
  );
}
