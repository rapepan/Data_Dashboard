import { useState } from 'react';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import Panel from '../components/report/Panel';
import DonutPanel from '../components/report/DonutPanel';
import RankTable from '../components/report/RankTable';
import CountSummaryCard from '../components/report/CountSummaryCard';
import ReportChart from '../charts/ReportChart';
import DualDonutChart from '../charts/DualDonutChart';
import { useReport } from '../hooks/useReport';
import { fetchPhysioReport } from '../services/reportService';
import type { PhysioReport, PhysioRightRevenue } from '../types/reports';
import { formatDmy, formatNumber } from '../utils/format';

/** สีกลุ่มการรักษา: รักษา / รักษา + ฟื้นฟู / ฟื้นฟูสมรรถภาพ / ส่งเสริมและป้องกัน / ไม่ระบุ (ไม่ใช้สีเขียวตามธีมระบบ) */
const CATEGORY_COLORS = ['#4f46e5', '#e11d48', '#8b5cf6', '#0ea5e9', '#f59e0b', '#94a3b8'];
const IPD_COLOR = '#8b5cf6';
const OPD_COLOR = '#4f46e5';
const WARD_COLORS = ['#0ea5e9', '#ec4899', '#8b5cf6', '#94a3b8'];
/** ในเวลา / นอกเวลา ต่อกลุ่มสิทธิหลัก (ชื่อตาม pcode ในฐาน) */
const RIGHT_COLORS = [['#4f46e5', '#312e81'], ['#0ea5e9', '#0c4a6e'], ['#f59e0b', '#92400e'], ['#94a3b8', '#334155']];

function RightsChart({ data, rights, which }: { data: PhysioReport; rights: string[]; which: 'opd' | 'ipd' }) {
  const byRight = data.byRight[which];
  return (
    <ReportChart
      labels={rights}
      horizontal
      stacked
      showValues
      height={240}
      printCategory="สิทธิการรักษา"
      series={[
        { label: 'ในเวลา', data: byRight.inHours, color: '#64748b' },
        { label: 'นอกเวลา', data: byRight.afterHours, color: '#1e1b3a' },
      ]}
    />
  );
}

/** เบิกได้ / เก็บเงิน */
const CLAIM_COLOR = '#4f46e5';
const SELFPAY_COLOR = '#f59e0b';
const baht = (n: number) => `${formatNumber(Math.round(n))} บาท`;

/** ค่ารักษาแยกเบิกได้ / เก็บเงิน + ตารางรายสิทธิ์ — ยอดรวมเท่านั้น ไม่มีข้อมูลรายผู้ป่วย */
function RevenueBlock({ data, kind, filter }: { data: PhysioReport; kind: 'opd' | 'ipd'; filter: 'all' | PhysioRightRevenue['group'] }) {
  const r = data.revenue[kind];
  const total = r.claim.amount + r.selfpay.amount;
  const rows = r.rights.filter(x => filter === 'all' || x.group === filter);
  const pct = (n: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : '0%');
  return (
    <>
      <div className="revenue-tiles">
        <div className="revenue-tile total">
          <small>ค่ารักษารวม</small>
          <b>{baht(total)}</b>
          <span>{formatNumber(r.claim.visits + r.selfpay.visits)} ครั้ง</span>
        </div>
        <div className="revenue-tile claim">
          <small><i className="fa-solid fa-file-invoice" /> เบิกได้</small>
          <b>{baht(r.claim.amount)}</b>
          <span>{formatNumber(r.claim.visits)} ครั้ง · {pct(r.claim.amount)}</span>
        </div>
        <div className="revenue-tile selfpay">
          <small><i className="fa-solid fa-hand-holding-dollar" /> เก็บเงิน</small>
          <b>{baht(r.selfpay.amount)}</b>
          <span>{formatNumber(r.selfpay.visits)} ครั้ง · {pct(r.selfpay.amount)}</span>
        </div>
      </div>
      <div className="table-responsive">
        <table className="report-table revenue-table">
          <thead><tr><th>สิทธิการรักษา</th><th className="center">กลุ่ม</th><th className="num">จำนวนครั้ง</th><th className="num">ค่ารักษา (บาท)</th></tr></thead>
          <tbody>
            {rows.map(x => (
              <tr key={x.code}>
                <td>{x.name} <small className="muted">({x.code})</small></td>
                <td className="center"><span className={`revenue-badge ${x.group}`}>{x.group === 'claim' ? 'เบิกได้' : 'เก็บเงิน'}</span></td>
                <td className="num">{formatNumber(x.visits)}</td>
                <td className="num">{formatNumber(x.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="center muted">ไม่มีข้อมูลในช่วงนี้</td></tr>}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>รวม</td>
              <td className="num">{formatNumber(rows.reduce((a, x) => a + x.visits, 0))}</td>
              <td className="num">{formatNumber(rows.reduce((a, x) => a + x.amount, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

export default function PhysioPage() {
  const { filter, applyFilter, data, error, refresh } = useReport(fetchPhysioReport);
  const [monthlyKind, setMonthlyKind] = useState<'opd' | 'ipd'>('opd');
  const [revenueKind, setRevenueKind] = useState<'opd' | 'ipd'>('opd');
  const [revenueFilter, setRevenueFilter] = useState<'all' | PhysioRightRevenue['group']>('all');

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="กายภาพบำบัด"
        subtitle={<>สถิติผู้รับบริการกายภาพบำบัด ระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={<FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />}
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? <PageSkeleton cards={3} rows={[3, 2]} /> : (() => {
        const period = `${formatDmy(data.start)} – ${formatDmy(data.end)}`;
        const fy = `ปีงบประมาณ ${data.fiscalYear}`;
        const monthNote = `สถิติสะสมทั้งเดือน (${formatDmy(data.month.start)} – ${formatDmy(data.month.end)})`;
        const dayNote = `ประจำวันที่ ${formatDmy(data.day.date)}`;
        const monthlyByRight = data.monthlyByRight[monthlyKind];
        return (
          <>
            {/* ภาพรวม */}
            <section className="report-row cols-3">
              <CountSummaryCard colors={CATEGORY_COLORS} accent="indigo" icon="fa-calendar-days" title="ผู้ป่วยกายภาพบำบัดรวมในช่วงที่เลือก" note={period} data={data.range} categories={data.categories} showSplit />
              <CountSummaryCard colors={CATEGORY_COLORS} accent="plum" icon="fa-calendar-check" title="ผู้ป่วยกายภาพบำบัดประจำเดือน" note={monthNote} data={data.month} categories={data.categories} showSplit />
              <CountSummaryCard colors={CATEGORY_COLORS} accent="amber" icon="fa-clock-rotate-left" title="ผู้ป่วยกายภาพบำบัดประจำวัน" note={dayNote} data={data.day} categories={data.categories} showSplit />
            </section>

            <section className="report-row cols-1-1-2">
              <Panel title="สัดส่วนผู้ป่วยและจำนวนครั้งรับบริการ" subtitle={`วงนอก: จำนวนครั้ง · วงใน: จำนวนคน (${period})`} printable>
                <DualDonutChart
                  labels={data.categories}
                  colors={CATEGORY_COLORS}
                  outer={{ label: 'ครั้ง', data: data.range.categories.map(c => c.visits) }}
                  inner={{ label: 'คน', data: data.range.categories.map(c => c.persons) }}
                  size={210}
                  printCategory="กลุ่มผู้ป่วย"
                />
              </Panel>
              <Panel title="สัดส่วนการให้บริการแยกตามหอผู้ป่วย" subtitle={`จำนวนครั้งผู้ป่วยในตามหอผู้ป่วย (${fy})`} printable>
                <DonutPanel items={data.wards} colors={WARD_COLORS} center={<><b>{formatNumber(data.wards.reduce((a, w) => a + w.value, 0))}</b><small>ครั้ง</small></>} size={210} legendPosition="bottom" valueLabel="จำนวนครั้งที่ให้บริการ (ครั้ง)" printCategory="กลุ่มหอผู้ป่วย (Ward Group)" />
              </Panel>
              <Panel title="สัดส่วนการให้บริการ IPD vs OPD รายเดือน" subtitle={`จำนวนครั้งผู้ป่วยในและผู้ป่วยนอก รายเดือน (${fy})`} printable>
                <ReportChart
                  labels={data.monthly.labels}
                  height={320}
                  printCategory="เดือน (Month)"
                  series={[
                    { label: 'ผู้ป่วยใน (IPD)', data: data.monthly.ipd, color: IPD_COLOR },
                    { label: 'ผู้ป่วยนอก (OPD)', data: data.monthly.opd, color: OPD_COLOR },
                  ]}
                />
              </Panel>
            </section>

            {/* เฉพาะผู้ป่วยใน */}
            <h2 className="section-heading"><i className="fa-solid fa-bed-pulse" /> ข้อมูลสถิติเฉพาะผู้ป่วยใน (IPD Only)</h2>
            <section className="report-row cols-3">
              <CountSummaryCard colors={CATEGORY_COLORS} accent="plum" icon="fa-bed-pulse" title="ผู้ป่วยในกายภาพบำบัดรวมในช่วงที่เลือก" note={period} data={data.ipdOnly.range} categories={data.categories} />
              <CountSummaryCard colors={CATEGORY_COLORS} accent="plum" icon="fa-calendar-check" title="ผู้ป่วยในกายภาพบำบัดประจำเดือน" note={monthNote} data={data.ipdOnly.month} categories={data.categories} />
              <CountSummaryCard colors={CATEGORY_COLORS} accent="plum" icon="fa-clock-rotate-left" title="ผู้ป่วยในกายภาพบำบัดประจำวัน" note={dayNote} data={data.ipdOnly.day} categories={data.categories} />
            </section>

            {/* อันดับโรค */}
            <section className="report-row cols-2">
              <Panel title="อันดับโรคของผู้ป่วยนอกที่มารับบริการกายภาพบำบัด" subtitle={`ข้อมูลผู้ป่วยนอกที่ได้รับบริการทางกายภาพบำบัด · ${period}`} printable>
                <RankTable items={data.topDiseases.opd} codeLabel="รหัส ICD-10" nameLabel="ชื่อโรคการวินิจฉัย" kind="opd" />
              </Panel>
              <Panel title="อันดับโรคของผู้ป่วยในที่มารับบริการกายภาพบำบัด" subtitle={`ข้อมูลผู้ป่วยในที่ได้รับบริการทางกายภาพบำบัด · ${period}`} printable>
                <RankTable items={data.topDiseases.ipd} codeLabel="รหัส ICD-10" nameLabel="ชื่อโรคการวินิจฉัย" kind="ipd" />
              </Panel>
            </section>

            <Panel title="อันดับหัตถการผู้ป่วยกายภาพบำบัด" subtitle={`จัดอันดับตามจำนวนครั้งการให้บริการหัตถการกายภาพบำบัด · ${period}`} printable className="mb-row">
              <RankTable items={data.topProcedures} codeLabel="รหัส ICD-9 / หัตถการ" nameLabel="ชื่อรายการหัตถการกายภาพบำบัด" />
            </Panel>

            {/* ตามสิทธิ์และเวลา */}
            <section className="report-row cols-2">
              <Panel title="จำนวนครั้งกายภาพบำบัดแยกตามสิทธิและเวลาให้บริการ (ผู้ป่วยนอก - OPD)" subtitle={`ในเวลา / นอกเวลาราชการ ตามกลุ่มสิทธิการรักษาหลัก (${fy})`} printable>
                <RightsChart data={data} rights={data.rights} which="opd" />
              </Panel>
              <Panel title="จำนวนครั้งกายภาพบำบัดแยกตามสิทธิและเวลาให้บริการ (ผู้ป่วยใน - IPD)" subtitle={`ในเวลา / นอกเวลาราชการ ตามกลุ่มสิทธิการรักษาหลัก (${fy})`} printable>
                <RightsChart data={data} rights={data.rights} which="ipd" />
              </Panel>
            </section>

            <Panel
              title="จำนวนครั้งกายภาพบำบัดแยกตามสิทธิและเวลาให้บริการแต่ละเดือน"
              subtitle={`ในเวลา / นอกเวลาราชการ แต่ละเดือนของ${fy} ตามกลุ่มสิทธิการรักษาหลัก`}
              printable
              actions={
                <div className="segmented">
                  <button className={monthlyKind === 'opd' ? 'active' : ''} onClick={() => setMonthlyKind('opd')}>ผู้ป่วยนอก (OPD)</button>
                  <button className={monthlyKind === 'ipd' ? 'active' : ''} onClick={() => setMonthlyKind('ipd')}>ผู้ป่วยใน (IPD)</button>
                </div>
              }
            >
              <ReportChart
                labels={data.monthly.labels}
                height={300}
                printCategory="เดือน"
                series={data.rights.flatMap((right, r) => [
                  { label: `${right} - ในเวลา`, data: monthlyByRight.inHours[r], color: RIGHT_COLORS[r][0] },
                  { label: `${right} - นอกเวลา`, data: monthlyByRight.afterHours[r], color: RIGHT_COLORS[r][1] },
                ])}
              />
            </Panel>

            {/* ค่ารักษา: เบิกได้ / เก็บเงิน */}
            <section className="report-row cols-2">
              <Panel
                title="ค่ารักษากายภาพบำบัด แยกเบิกได้ / เก็บเงิน"
                subtitle={`ตามสิทธิการรักษา · ${period}`}
                printable
              >
                <div className="revenue-switches no-print">
                  <div className="segmented">
                    <button className={revenueKind === 'opd' ? 'active' : ''} onClick={() => setRevenueKind('opd')}>ผู้ป่วยนอก (OPD)</button>
                    <button className={revenueKind === 'ipd' ? 'active' : ''} onClick={() => setRevenueKind('ipd')}>ผู้ป่วยใน (IPD)</button>
                  </div>
                  <div className="segmented">
                    <button className={revenueFilter === 'all' ? 'active' : ''} onClick={() => setRevenueFilter('all')}>ทั้งหมด</button>
                    <button className={revenueFilter === 'claim' ? 'active' : ''} onClick={() => setRevenueFilter('claim')}>เบิกได้</button>
                    <button className={revenueFilter === 'selfpay' ? 'active' : ''} onClick={() => setRevenueFilter('selfpay')}>เก็บเงิน</button>
                  </div>
                </div>
                <RevenueBlock data={data} kind={revenueKind} filter={revenueFilter} />
              </Panel>
              <Panel title="ค่ารักษากายภาพบำบัดรายเดือน (ผู้ป่วยนอก)" subtitle={`เบิกได้ / เก็บเงิน แต่ละเดือนของ${fy} (บาท)`} printable>
                <ReportChart
                  labels={data.revenue.monthly.labels}
                  stacked
                  height={520}
                  printCategory="เดือน"
                  series={[
                    { label: 'เบิกได้', data: data.revenue.monthly.claim, color: CLAIM_COLOR },
                    { label: 'เก็บเงิน', data: data.revenue.monthly.selfpay, color: SELFPAY_COLOR },
                  ]}
                />
              </Panel>
            </section>

            {/* นัดหมาย — นับจำนวนเท่านั้น ไม่แสดงรายชื่อผู้ป่วย */}
            <section className="report-row cols-3">
              <Panel title="การนัดหมายกายภาพบำบัด" subtitle={period} printable>
                <DonutPanel
                  items={[
                    { label: 'มาตามนัด', value: data.appointments.came },
                    { label: 'ไม่มาตามนัด', value: data.appointments.noShow },
                    { label: 'Walk-in (ไม่มีนัด)', value: data.appointments.walkIn },
                    ...(data.appointments.pendingToday ? [{ label: 'นัดวันนี้ที่ยังไม่มา', value: data.appointments.pendingToday }] : []),
                  ]}
                  colors={['#4f46e5', '#e11d48', '#8b5cf6', '#94a3b8']}
                  center={<><b>{formatNumber(data.appointments.came + data.appointments.noShow + data.appointments.walkIn + data.appointments.pendingToday)}</b><small>ครั้ง</small></>}
                  valueLabel="จำนวนครั้ง"
                />
                <div className="rate-box">
                  <i className="fa-solid fa-calendar-check" />
                  <div>
                    <small>อัตรามาตามนัด</small>
                    <b>{data.appointments.came + data.appointments.noShow ? Math.round((data.appointments.came / (data.appointments.came + data.appointments.noShow)) * 100) : 0}%</b>
                  </div>
                  <div>
                    <small>นัดล่วงหน้า 30 วัน</small>
                    <b>{formatNumber(data.appointments.upcoming30)}</b>
                  </div>
                </div>
              </Panel>
              <Panel title="การนัดหมายรายเดือน" subtitle={`มาตามนัด / ไม่มาตามนัด / Walk-in (${fy})`} printable>
                <ReportChart
                  labels={data.appointments.monthly.labels}
                  stacked
                  height={300}
                  printCategory="เดือน"
                  series={[
                    { label: 'มาตามนัด', data: data.appointments.monthly.came, color: '#4f46e5' },
                    { label: 'ไม่มาตามนัด', data: data.appointments.monthly.noShow, color: '#e11d48' },
                    { label: 'Walk-in', data: data.appointments.monthly.walkIn, color: '#c4b5fd' },
                  ]}
                />
              </Panel>
              <Panel title="จำนวนนัดตามวันในสัปดาห์" subtitle={`ใช้วางแผนกำลังคน (${fy})`} printable>
                <ReportChart
                  labels={data.appointments.weekday.labels}
                  height={300}
                  showLegend={false}
                  showValues
                  printCategory="วัน"
                  highlightIndex={data.appointments.weekday.values.indexOf(Math.max(...data.appointments.weekday.values))}
                  series={[{ label: 'จำนวนนัด', data: data.appointments.weekday.values, color: '#a5b4fc' }]}
                />
              </Panel>
            </section>
          </>
        );
      })()}
    </>
  );
}
