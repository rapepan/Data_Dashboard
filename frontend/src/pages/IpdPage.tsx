import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import Panel from '../components/report/Panel';
import MetricTile from '../components/report/MetricTile';
import HBarList from '../components/report/HBarList';
import DonutPanel from '../components/report/DonutPanel';
import FlowSteps from '../components/report/FlowSteps';
import StatusPill, { StatusIcon } from '../components/report/StatusPill';
import ReportChart from '../charts/ReportChart';
import { useReport } from '../hooks/useReport';
import { fetchIpdReport } from '../services/reportService';
import type { AlertStatus } from '../types/reports';
import { FEATURES, panelNumbers } from '../config/features';
import { formatDmy } from '../utils/format';

const C = { indigo: '#4f46e5', violet: '#8b5cf6', amber: '#f59e0b', orange: '#f97316', rose: '#e11d48', slate: '#94a3b8', sky: '#0ea5e9', plum: '#a21caf' };
const FLOW_ICONS = ['fa-notes-medical', 'fa-bed-pulse', 'fa-heart-pulse', 'fa-droplet', 'fa-file-circle-check'];
const ALERT_LABEL: Record<AlertStatus, string> = { critical: 'เร่งดำเนินการ', warning: 'เฝ้าระวัง', ok: 'ติดตาม' };

/** สีแถบอัตราครองเตียง: ≥ 85% แดง, ≥ 75% ส้ม, นอกนั้นคราม */
function occupancyColor(pct: number) {
  if (pct >= 85) return C.rose;
  if (pct >= 75) return C.orange;
  return C.indigo;
}

export default function IpdPage() {
  const { filter, applyFilter, data, error, refresh } = useReport(fetchIpdReport);

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="IPD KPI Summary — ภาพรวมผู้ป่วยใน"
        subtitle={<>ข้อมูลระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={<FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />}
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? <PageSkeleton cards={6} rows={[3, 3]} /> : (() => {
        const occupancy = Math.round((data.kpis.usedBeds / data.kpis.totalBeds) * 100);
        const statusTotal = data.kpis.usedBeds;
        const losTotal = data.losBuckets.reduce((sum, s) => sum + s.value, 0);
        // ส่วนที่ซ่อนไว้กำหนดที่ config/features.ts
        const num = panelNumbers();
        const alerts = data.alerts.filter(a => FEATURES.ipdLabAlert || !a.issue.includes('รอผลตรวจ'));
        const row2 = 2 + (FEATURES.ipdDischargePlanning ? 1 : 0);
        return (
          <>
            {/* 1. KPI */}
            <section className="grid-6">
              <MetricTile accent="indigo" icon="fa-users" label="ผู้ป่วยในปัจจุบัน" metric={data.kpis.current} unit="ราย" compareLabel="vs. เดือนก่อน" />
              <MetricTile accent="plum" icon="fa-right-to-bracket" label="รับใหม่ (Admissions)" metric={data.kpis.admissions} unit="ราย" compareLabel="vs. เดือนก่อน" />
              <MetricTile accent="rose" icon="fa-right-from-bracket" label="จำหน่าย (Discharges)" metric={data.kpis.discharges} unit="ราย" compareLabel="vs. เดือนก่อน" />
              <article className="card-box metric-tile occupancy-tile" data-accent="amber">
                <span className="ring" style={{ ['--pct' as string]: occupancy }}><b>{occupancy}%</b></span>
                <div className="metric-body">
                  <span className="metric-label">อัตราครองเตียง</span>
                  <span className="occupancy-lines">
                    <span>เตียงทั้งหมด <b>{data.kpis.totalBeds}</b></span>
                    <span>เตียงที่ใช้ <b>{data.kpis.usedBeds}</b></span>
                    <span>เตียงว่าง <b>{data.kpis.totalBeds - data.kpis.usedBeds}</b></span>
                  </span>
                </div>
              </article>
              <MetricTile accent="slate" icon="fa-hourglass-half" label="ระยะนอนเฉลี่ย (ALOS)" metric={data.kpis.avgLos} unit="วัน" goodWhen="down" compareLabel="vs. เดือนก่อน" />
              <MetricTile accent="amber" icon="fa-arrows-rotate" label="กลับมานอนซ้ำ 28 วัน" metric={data.kpis.readmission30} display={<>{data.kpis.readmission30.value}<small>%</small></>} goodWhen="down" compareLabel="vs. เดือนก่อน" />
            </section>

            <section className="report-row cols-3">
              {/* Trend */}
              <Panel num={num()} title="Admission & Discharge Trend" subtitle="รับใหม่ / จำหน่าย (แท่ง) และผู้ป่วยในปัจจุบัน (เส้น)" printable>
                <ReportChart
                  labels={data.trend.labels}
                  series={[
                    { label: 'Admissions', data: data.trend.admissions, color: C.indigo },
                    { label: 'Discharges', data: data.trend.discharges, color: C.violet },
                    { label: 'Current Inpatients', data: data.trend.current, color: C.orange, type: 'line' },
                  ]}
                  height={280}
                />
              </Panel>

              {/* Ward occupancy */}
              <Panel num={num()} title="Bed Occupancy by Ward" subtitle="อัตราครองเตียงรายหอผู้ป่วย" printable>
                <table className="report-table compact">
                  <thead><tr><th>Ward</th><th className="num">เตียง</th><th className="num">ใช้</th><th className="num">ว่าง</th><th>Occupancy</th></tr></thead>
                  <tbody>
                    {data.wards.map(ward => {
                      const pct = (ward.used / ward.beds) * 100;
                      return (
                        <tr key={ward.ward}>
                          <td>{ward.ward}</td>
                          <td className="num">{ward.beds}</td>
                          <td className={`num ${pct >= 85 ? 'text-critical' : ''}`}>{ward.used}</td>
                          <td className="num">{ward.beds - ward.used}</td>
                          <td><span className="occ-bar"><span className="occ-track"><span style={{ width: `${pct}%`, background: occupancyColor(pct) }} /></span><em style={{ color: occupancyColor(pct) }}>{pct.toFixed(1)}%</em></span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Panel>

              {/* Patient Status (ซ่อน: FEATURES.ipdPatientStatus) + LOS */}
              <div className="panel-stack">
                {FEATURES.ipdPatientStatus && (
                <Panel num={num()} title="Patient Status" subtitle="สถานะผู้ป่วยในปัจจุบัน" printable>
                  <DonutPanel items={data.patientStatus} colors={[C.indigo, C.violet, C.amber, C.sky, C.slate]} size={140} />
                </Panel>
                )}
                <Panel num={num()} title="Length of Stay (LOS)" subtitle="จำนวนผู้ป่วยตามระยะเวลานอนโรงพยาบาล" printable>
                  <ReportChart
                    labels={data.losBuckets.map(b => b.label)}
                    series={[{ label: 'ผู้ป่วย', data: data.losBuckets.map(b => b.value), color: C.violet }]}
                    highlightIndex={data.losBuckets.length - 1}
                    showLegend={false}
                    showValues
                    height={150}
                  />
                  <p className="panel-foot-note">{data.losBuckets.map(b => `${b.label} ${((b.value / losTotal) * 100).toFixed(1)}%`).join(' · ')}</p>
                </Panel>
              </div>
            </section>

            <section className={`report-row cols-${row2}`}>
              {/* Flow */}
              <Panel num={num()} title="Patient Flow (Inpatient Journey)" subtitle="จำนวนผู้ป่วยในแต่ละขั้นตอน (Snapshot ปัจจุบัน)" printable>
                <FlowSteps steps={data.flow} icons={FLOW_ICONS} />
              </Panel>

              {/* Discharge planning (ซ่อน: FEATURES.ipdDischargePlanning) */}
              {FEATURES.ipdDischargePlanning && (
              <Panel num={num()} title="Discharge Planning & Turnaround" subtitle="สถานะการจำหน่ายผู้ป่วย" printable>
                <DonutPanel items={data.dischargePlanning.items} colors={[C.indigo, C.sky, C.amber, C.rose]} size={140} />
                <div className="panel-note">
                  <i className="fa-solid fa-clock-rotate-left" />
                  เวลาจากแพทย์สั่งจำหน่าย → เตียงว่างพร้อมใช้ เฉลี่ย <b>{data.dischargePlanning.avgTurnaroundHours} ชั่วโมง</b> (เป้าหมาย ≤ {data.dischargePlanning.targetHours} ชั่วโมง)
                </div>
              </Panel>
              )}

              {/* Waiting for bed */}
              <Panel num={num()} title="Waiting for Bed" subtitle="ผู้ป่วยรอเตียง (จาก ER / ภายใน)" printable>
                <div className="waiting-bed">
                  <div className="waiting-total">
                    <i className="fa-solid fa-bed-pulse" />
                    <b>{data.waitingBed.fromEr + data.waitingBed.fromOpd}</b>
                    <small>ราย</small>
                  </div>
                  <ul>
                    <li><span>รอเตียงจาก ER</span><b>{data.waitingBed.fromEr} ราย</b></li>
                    <li><span>รอเตียงจากภายใน (OPD)</span><b>{data.waitingBed.fromOpd} ราย</b></li>
                  </ul>
                </div>
                <div className="rate-box">
                  <i className="fa-solid fa-stopwatch" />
                  <div>
                    <small>ระยะเวลารอเตียงเฉลี่ย</small>
                    <b>{data.waitingBed.avgWaitHours} ชั่วโมง</b>
                  </div>
                </div>
              </Panel>
            </section>

            <section className="report-row cols-2-1">
              {/* Profile */}
              <Panel num={num()} title="Patient Profile" subtitle="สัดส่วนผู้ป่วยตามกลุ่มต่าง ๆ" printable>
                <div className="profile-grid">
                  <div>
                    <small className="sub-title">ตามประเภทการรักษา (สิทธิ์)</small>
                    <DonutPanel items={data.profile.byRight} colors={[C.indigo, C.violet, C.amber, C.sky, C.slate]} valuesArePercent center={<><b>{statusTotal}</b><small>ราย</small></>} size={130} legendPosition="bottom" />
                  </div>
                  <div>
                    <small className="sub-title">ตามช่วงอายุ (%)</small>
                    <ReportChart
                      labels={data.profile.byAge.map(a => a.label)}
                      series={[{ label: '%', data: data.profile.byAge.map(a => a.value), color: C.violet }]}
                      showLegend={false}
                      showValues
                      height={200}
                    />
                  </div>
                  <div>
                    <small className="sub-title">ตามกลุ่มโรค (Top 5)</small>
                    <HBarList items={data.profile.topDiseases} color={C.indigo} format={item => `${item.value}%`} labelWidth={120} />
                  </div>
                </div>
              </Panel>

              {/* Alert */}
              <Panel num={num()} title="Alert & Action" subtitle="รายการที่ต้องติดตาม" tone="danger" printable>
                <table className="report-table compact">
                  <thead><tr><th>ประเด็น</th><th>Ward / หน่วยงาน</th><th className="center">สถานะ</th><th>Action</th></tr></thead>
                  <tbody>
                    {alerts.map(alert => (
                      <tr key={alert.issue}>
                        <td><StatusIcon status={alert.status} /> {alert.issue}</td>
                        <td className="muted">{alert.ward}</td>
                        <td className="center"><StatusPill status={alert.status} label={ALERT_LABEL[alert.status]} /></td>
                        <td>{alert.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </section>
          </>
        );
      })()}
    </>
  );
}
