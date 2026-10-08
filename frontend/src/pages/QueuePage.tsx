import { useState, type ReactNode } from 'react';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import Panel from '../components/report/Panel';
import ReportChart from '../charts/ReportChart';
import { useReport } from '../hooks/useReport';
import { fetchQueueReport } from '../services/reportService';
import type { Minutes } from '../types/reports';
import { formatDmy, formatDuration, formatThaiMonth } from '../utils/format';

/** ขั้นตอน (ลำดับตาม report.steps): รอคัดกรอง / ซักประวัติ / รอพบแพทย์ / ตรวจรักษา / รอรับยา / ชำระเงิน */
const STEP_STYLE = [
  { icon: 'fa-notes-medical', color: '#0ea5e9', dashed: false },
  { icon: 'fa-book-medical', color: '#64748b', dashed: true },
  { icon: 'fa-user-doctor', color: '#8b5cf6', dashed: false },
  { icon: 'fa-wave-square', color: '#a21caf', dashed: true },
  { icon: 'fa-capsules', color: '#f59e0b', dashed: false },
  { icon: 'fa-receipt', color: '#e11d48', dashed: true },
];
const TOTAL_COLOR = '#4f46e5';

const show = (value: Minutes) => (value == null ? '-' : formatDuration(value));

function WaitTile({ label, minutes, icon, color, highlight, change }: { label: string; minutes: Minutes; icon: string; color: string; highlight?: boolean; change?: ReactNode }) {
  return (
    <article className={`card-box wait-tile${highlight ? ' highlight' : ''}`} style={{ ['--c' as string]: color }}>
      <span className="wait-icon"><i className={`fa-solid ${icon}`} /></span>
      <div>
        <span className="wait-label">{label}</span>
        <b className="wait-time">{show(minutes)}</b>
        <small>{minutes == null ? 'ไม่มีข้อมูล' : `(~${minutes.toFixed(1)} นาที)`}</small>
        {change}
      </div>
    </article>
  );
}

export default function QueuePage() {
  const { filter, applyFilter, data, error, refresh, compare } = useReport(fetchQueueReport, { compare: true });
  const [showMonthlyChart, setShowMonthlyChart] = useState(false);

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="รายงานสถิติระยะเวลารอคอย (OPD Waiting Time)"
        subtitle={<>ค่าเฉลี่ยเวลารอในแต่ละขั้นตอนของผู้ป่วยนอก ระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={<FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />}
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? <PageSkeleton cards={7} rows={[1, 1]} /> : (() => {
        const chronological = [...data.monthly].reverse();
        return (
          <>
            <section className="grid-7">
              {data.steps.map((step, i) => (
                <WaitTile key={step} label={step} minutes={data.average.steps[i]} icon={STEP_STYLE[i].icon} color={STEP_STYLE[i].color} change={compare(r => r.average.steps[i], 'down')} />
              ))}
              <WaitTile label="รวมเวลาทั้งหมด" minutes={data.average.total} icon="fa-stopwatch" color={TOTAL_COLOR} highlight change={compare(r => r.average.total, 'down')} />
            </section>

            <Panel
              title="แนวโน้มระยะเวลารอคอยแบบรายวัน (Daily Waiting Time Trend)"
              subtitle={`กราฟแสดงระยะเวลารอคอยรายวัน (นาที) ครบ 7 เส้น · ${formatDmy(data.start)} – ${formatDmy(data.end)}`}
              printable
              className="mb-row"
              actions={<span className="data-days">ข้อมูล: {data.daily.dates.length} วัน</span>}
            >
              {data.daily.dates.length === 0 ? (
                <p className="empty-note"><i className="fa-solid fa-calendar-xmark" /> ไม่มีวันทำการในช่วงที่เลือก</p>
              ) : (
                <ReportChart
                  labels={data.daily.dates.map(d => formatDmy(d).slice(0, 5))}
                  height={340}
                  printTable="plain"
                  printCategory="วันที่"
                  series={[
                    { label: 'รวมเวลาทั้งหมด', data: data.daily.total, color: TOTAL_COLOR, type: 'line', fill: true },
                    ...data.steps.map((step, i) => ({ label: step, data: data.daily.values[i], color: STEP_STYLE[i].color, type: 'line' as const, dashed: STEP_STYLE[i].dashed })),
                  ]}
                />
              )}
            </Panel>

            <Panel
              title="ข้อมูลระยะเวลารอคอย 12 เดือนย้อนหลัง (12 Months Summary)"
              subtitle={`${formatThaiMonth(chronological[0].month)} – ${formatThaiMonth(chronological[chronological.length - 1].month)} · ค่าเฉลี่ยรายเดือน (ชม:นาที:วินาที)`}
              printable
              actions={
                <label className="switch-toggle no-print">
                  <i className="fa-solid fa-chart-column" /> แสดงกราฟเปรียบเทียบ
                  <input type="checkbox" checked={showMonthlyChart} onChange={e => setShowMonthlyChart(e.target.checked)} />
                  <span className="switch" />
                </label>
              }
            >
              {/* ปิดสวิตช์อยู่ก็ยังพิมพ์กราฟออกไปด้วย (เอกสาร = กราฟ + ตาราง) */}
              <div className={showMonthlyChart ? undefined : 'print-only-block'}>
                <ReportChart
                  labels={chronological.map(m => formatThaiMonth(m.month))}
                  stacked
                  height={300}
                  series={data.steps.map((step, i) => ({ label: step, data: chronological.map(m => m.steps[i]), color: STEP_STYLE[i].color }))}
                />
              </div>
              <div className="table-responsive">
                <table className="report-table queue-table">
                  <thead>
                    <tr>
                      <th>เดือน-ปี</th>
                      {data.steps.map(step => <th key={step} className="num">{step}</th>)}
                      <th className="num total-col">รวมเวลาทั้งหมด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthly.map(month => (
                      <tr key={month.month}>
                        <td><span className="month-chip">{formatThaiMonth(month.month)}</span></td>
                        {month.steps.map((value, i) => <td key={data.steps[i]} className={`num${value == null ? ' muted' : ''}`}>{show(value)}</td>)}
                        <td className="num total-col"><b>{formatDuration(month.total)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="panel-foot-note">"-" = เดือนนั้นยังไม่มีการบันทึกเวลาของขั้นตอนนี้ (รวมเวลาทั้งหมดคิดเฉพาะขั้นตอนที่มีข้อมูล)</p>
            </Panel>
          </>
        );
      })()}
    </>
  );
}
