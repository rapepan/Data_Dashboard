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
import type { PhysioReport } from '../types/reports';
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

export default function PhysioPage() {
  const { filter, applyFilter, data, error, refresh } = useReport(fetchPhysioReport);
  const [monthlyKind, setMonthlyKind] = useState<'opd' | 'ipd'>('opd');

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
          </>
        );
      })()}
    </>
  );
}
