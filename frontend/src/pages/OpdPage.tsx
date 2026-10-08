import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import Panel from '../components/report/Panel';
import MetricTile from '../components/report/MetricTile';
import HBarList from '../components/report/HBarList';
import DonutPanel from '../components/report/DonutPanel';
import StatusPill, { StatusIcon } from '../components/report/StatusPill';
import ReportChart from '../charts/ReportChart';
import ChangeBadge from '../components/report/ChangeBadge';
import { previousRange } from '../utils/compare';
import { useCallback, useEffect, useState } from 'react';
import AppointmentClinicTable from '../components/report/AppointmentClinicTable';
import DatePicker from '../components/ui/DatePicker';
import { useReport } from '../hooks/useReport';
import { fetchOpdAppointments, fetchOpdAppointmentsAhead, fetchOpdReport } from '../services/reportService';
import type { AlertStatus, OpdAppointments } from '../types/reports';
import { formatDmy, toIsoDate } from '../utils/format';
import { FEATURES, panelNumbers } from '../config/features';

const C = { indigo: '#4f46e5', violet: '#8b5cf6', amber: '#f59e0b', rose: '#e11d48', slate: '#94a3b8', sky: '#0ea5e9' };
const FLOW_ICONS = ['fa-id-card', 'fa-heart-pulse', 'fa-user-doctor', 'fa-capsules', 'fa-coins'];

function waitStatus(minutes: number, target: number): AlertStatus {
  if (minutes > target * 1.2) return 'critical';
  if (minutes > target) return 'warning';
  return 'ok';
}

export default function OpdPage() {
  const { filter, applyFilter, data, error, refresh } = useReport(fetchOpdReport);
  // นัดหมายรายคลินิก วันนี้/พรุ่งนี้ — ไม่ขึ้นกับตัวกรองวันที่
  const [appts, setAppts] = useState<OpdAppointments | null>(null);
  const loadAppts = useCallback(async () => {
    try { setAppts(await fetchOpdAppointments()); } catch { /* แผงนี้ว่างไว้ ไม่กระทบรายงานหลัก */ }
  }, []);
  useEffect(() => { void loadAppts(); }, [loadAppts]);

  // แผง 7 เลือกดูวันย้อนหลังได้ (ล่วงหน้าไม่ได้ — วันพรุ่งนี้อยู่แผง 8) · วันนี้ใช้ข้อมูลชุดเดียวกับแผง 8
  const todayIso = toIsoDate(new Date());
  const [apptDate, setApptDate] = useState(todayIso);
  const [pastAppts, setPastAppts] = useState<OpdAppointments | null>(null);
  const isPastDay = apptDate < todayIso;
  useEffect(() => {
    if (!isPastDay) return;
    let cancelled = false;
    setPastAppts(null);
    fetchOpdAppointments(apptDate).then(r => { if (!cancelled) setPastAppts(r); }).catch(() => { /* แผงนี้ว่างไว้ */ });
    return () => { cancelled = true; };
  }, [apptDate, isPastDay]);
  const shownDay = isPastDay ? pastAppts?.today : appts?.today;

  // แผง 8 เลือกดูล่วงหน้าได้ (ไม่เกิน 1 ปี) ย้อนหลังไม่ได้ — พรุ่งนี้ใช้ข้อมูลชุดเดียวกับแผง 7
  const shiftIso = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return toIsoDate(d); };
  const tomorrowIso = shiftIso(1);
  const [aheadDate, setAheadDate] = useState(tomorrowIso);
  const [aheadAppts, setAheadAppts] = useState<OpdAppointments | null>(null);
  const isLaterDay = aheadDate !== tomorrowIso;
  useEffect(() => {
    if (!isLaterDay) return;
    let cancelled = false;
    setAheadAppts(null);
    fetchOpdAppointmentsAhead(aheadDate).then(r => { if (!cancelled) setAheadAppts(r); }).catch(() => { /* แผงนี้ว่างไว้ */ });
    return () => { cancelled = true; };
  }, [aheadDate, isLaterDay]);
  const aheadDay = isLaterDay ? aheadAppts?.tomorrow : appts?.tomorrow;
  const refreshAll = () => { refresh(); void loadAppts(); };

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="OPD KPI Summary — ภาพรวมตัวชี้วัดผู้ป่วยนอก"
        subtitle={<>ข้อมูลระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={<FilterBar filter={filter} onApply={applyFilter} onRefresh={refreshAll} />}
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? <PageSkeleton cards={5} rows={[3, 3]} /> : (() => {
        // ส่วนที่ซ่อนไว้กำหนดที่ config/features.ts
        const num = panelNumbers();
        const alerts = data.alerts.filter(a => FEATURES.satisfaction || !a.issue.includes('ความพึงพอใจ'));
        return (
        <>
          {/* 1. KPI */}
          <section className={FEATURES.satisfaction ? 'grid-6' : 'grid-5'}>
            <MetricTile accent="indigo" icon="fa-users" label="จำนวนผู้ป่วยทั้งหมด" metric={data.kpis.total} unit="ราย" />
            <MetricTile accent="plum" icon="fa-user-plus" label="ผู้ป่วยใหม่" metric={data.kpis.newPatients} unit="ราย" />
            <MetricTile accent="slate" icon="fa-user-check" label="ผู้ป่วยเก่า" metric={data.kpis.oldPatients} unit="ราย" />
            <MetricTile accent="rose" icon="fa-stopwatch" label="เวลารวมเฉลี่ย (มาถึง → ชำระเงิน)" metric={data.kpis.avgWait} unit="นาที" goodWhen="down" />
            <MetricTile accent="amber" icon="fa-user-doctor" label="เวลาเฉลี่ยจนแพทย์ตรวจเสร็จ" metric={data.kpis.avgDoctor} unit="นาที" goodWhen="down" />
            {FEATURES.satisfaction && <MetricTile accent="indigo" icon="fa-face-smile" label="ความพึงพอใจผู้ป่วย" metric={data.kpis.satisfaction} display={<>{data.kpis.satisfaction.value}<small>/ 5</small></>} />}
          </section>

          {/* ใบสั่งยาที่มียา ต่อวัน — ข้อมูลรุ่นเก่า (ที่พักผลก่อนอัปเดต) ไม่มีส่วนนี้ ข้ามไปไม่ให้หน้าพัง */}
          {data.prescriptions && (() => {
            const rx = data.prescriptions;
            return (
              <Panel
                printable
                num={num()}
                className="mb-row"
                title="ใบสั่งยาที่มียา ต่อวัน"
                subtitle={<>1 ใบ = ผู้ป่วยนอก 1 ครั้งที่ได้รับยา· {formatDmy(data.start)} – {formatDmy(data.end)}</>}
              >
                <div className="rx-summary">
                  <div className="rx-main">
                    <span>เฉลี่ยต่อวันทำการ (จ.–ศ.)</span>
                    <b>{rx.perWorkday.value.toLocaleString('en-US')} <small>ใบ/วัน</small></b>
                    <ChangeBadge change={rx.perWorkday.change} range={previousRange(data.start, data.end)} />
                  </div>
                  <div>
                    <span>เฉลี่ยเสาร์–อาทิตย์</span>
                    <b>{rx.perWeekend === null ? '–' : <>{rx.perWeekend.toLocaleString('en-US')} <small>ใบ/วัน</small></>}</b>
                    <small>{rx.weekendDays} วัน</small>
                  </div>
                  <div>
                    <span>รวมทั้งช่วง</span>
                    <b>{rx.total.toLocaleString('en-US')} <small>ใบ</small></b>
                    <small>วันทำการ {rx.workdays} วัน · หยุด {rx.weekendDays} วัน</small>
                  </div>
                  <div>
                    <span>คิดเป็นของผู้ป่วยนอก</span>
                    <b>{rx.pct}%</b>
                    <small>จาก {rx.visits.toLocaleString('en-US')} ครั้ง</small>
                  </div>
                </div>
                <ReportChart
                  labels={rx.daily.dates.map(d => formatDmy(d).slice(0, 5))}
                  stacked
                  height={280}
                  printCategory="วันที่"
                  rightAxis={{ suffix: '%', min: 0, max: 100 }}
                  series={[
                    { label: 'มียา (ใบ)', data: rx.daily.withDrug, color: C.indigo },
                    { label: 'ไม่มียา (ครั้ง)', data: rx.daily.noDrug, color: '#cbd5e1' },
                    { label: '% ที่ได้รับยา', type: 'line', axis: 'right', color: C.rose, data: rx.daily.withDrug.map((w, i) => {
                      const all = w + rx.daily.noDrug[i];
                      return all ? Math.round((w / all) * 1000) / 10 : null;
                    }) },
                  ]}
                />
              </Panel>
            );
          })()}

          <section className="report-row cols-3">
            {/* 2. ตามเวลา */}
            <Panel printable num={num()} title="จำนวนผู้ป่วยตามเวลา" subtitle={<>ช่วงพีค <b>{data.byHour.peakLabel}</b> ({data.byHour.peakValue.toLocaleString('en-US')} ราย/ชั่วโมง) · เฉลี่ยต่อวันทำการ</>}>
              <ReportChart
                labels={data.byHour.labels}
                series={[
                  { label: 'ผู้ป่วยทั้งหมด', data: data.byHour.total, color: C.indigo, type: 'line', fill: true },
                  { label: 'Walk-in', data: data.byHour.walkin, color: C.violet, type: 'line' },
                  { label: 'Appointment', data: data.byHour.appointment, color: C.amber, type: 'line' },
                ]}
              />
            </Panel>

            {/* 3. 10 อันดับโรค */}
            <Panel num={num()} title="10 อันดับโรคผู้ป่วยนอก (Top 10)" subtitle="ตามการวินิจฉัยหลัก (ICD-10) · จำนวนครั้ง" printable>
              <ol className="dx-list">
                {data.topDiseases.map((dx, i) => (
                  <li key={dx.code}>
                    <span className="dx-rank">{i + 1}</span>
                    <span className="dx-body">
                      <span className="dx-name" data-tip={`${dx.code} · ${dx.nameTh ? `${dx.nameTh} (${dx.name})` : dx.name} — ${dx.patients.toLocaleString('en-US')} ราย`}><b>{dx.code}</b> {dx.nameTh ?? dx.name}</span>
                      <span className="hbar-track"><span style={{ width: `${(dx.visits / data.topDiseases[0].visits) * 100}%`, background: i < 3 ? C.indigo : C.violet }} /></span>
                    </span>
                    <span className="dx-value">{dx.visits.toLocaleString('en-US')}</span>
                  </li>
                ))}
              </ol>
            </Panel>

            {/* 4. Patient Flow */}
            <Panel num={num()} title="OPD Patient Flow" subtitle="จำนวนผู้ป่วยที่มีเวลาบันทึกในแต่ละจุดบริการ (service_time)" printable>
              <ul className="flow-list">
                {data.flow.map((step, i) => {
                  const pct = Math.round((step.value / data.flow[0].value) * 100);
                  return (
                    <li key={step.label}>
                      <span className="flow-list-icon"><i className={`fa-solid ${FLOW_ICONS[i]}`} /></span>
                      <span className="flow-list-label">{step.label}</span>
                      <span className="flow-list-bar"><span style={{ width: `${pct}%` }}><b>{step.value.toLocaleString('en-US')}</b></span></span>
                      <em>{pct}%</em>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </section>

          <section className="report-row cols-2">
            {/* 5. เวลารอแต่ละขั้นตอน */}
            <Panel num={num()} title="การวิเคราะห์เวลารอในแต่ละขั้นตอน" printable>
              <table className="report-table">
                <thead><tr><th>ขั้นตอน</th><th className="num">เวลารอเฉลี่ย</th><th className="num">Target (SLA)</th><th className="center">สถานะ</th></tr></thead>
                <tbody>
                  {data.waitSteps.map(step => {
                    const status = waitStatus(step.avgMinutes, step.targetMinutes);
                    return (
                      <tr key={step.step}>
                        <td>{step.step}</td>
                        <td className={`num ${status !== 'ok' ? `text-${status}` : ''}`}>{step.avgMinutes} นาที</td>
                        <td className="num muted">≤ {step.targetMinutes} นาที</td>
                        <td className="center"><StatusIcon status={status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>

            {/* 6. การนัดหมาย */}
            <Panel num={num()} title="การนัดหมาย (Appointment)" printable>
              <DonutPanel
                items={[
                  { label: 'Walk-in', value: data.appointment.walkin },
                  { label: 'มาตามนัด', value: data.appointment.onTime },
                  { label: 'ยกเลิกนัด', value: data.appointment.cancelled },
                  { label: 'No-show', value: data.appointment.noShow },
                ]}
                colors={[C.indigo, C.violet, C.amber, C.rose]}
              />
              <div className="rate-box">
                <i className="fa-solid fa-calendar-check" />
                <div>
                  <small>อัตรามาตามนัด</small>
                  <b>{data.appointment.onTimeRate}%</b>
                </div>

              </div>
            </Panel>
          </section>

          <section className="report-row cols-2">
            {/* 7. นัดหมายวันนี้ / ย้อนหลัง */}
            <Panel
              printable
              num={num()}
              title={isPastDay ? `นัดหมายรายคลินิก — ย้อนหลัง ${formatDmy(apptDate)}` : 'นัดหมายรายคลินิก — วันนี้'}
              subtitle={shownDay ? <><b>{formatDmy(shownDay.date)}</b> · นัด {shownDay.total.toLocaleString('en-US')} ราย · {isPastDay ? 'มาตามนัด' : 'มาแล้ว'} {shownDay.arrived.toLocaleString('en-US')} ราย{isPastDay && shownDay.total > 0 ? ` (${Math.round((shownDay.arrived / shownDay.total) * 100)}%)` : ''}</> : 'กำลังโหลด...'}
              actions={<DatePicker value={apptDate} max={todayIso} onChange={setApptDate} />}
            >
              {shownDay ? <AppointmentClinicTable day={shownDay} showArrived past={isPastDay} /> : <div className="sk sk-chart" style={{ height: 260 }} />}
            </Panel>

            {/* 8. นัดหมายพรุ่งนี้ / ล่วงหน้า */}
            <Panel
              printable
              num={num()}
              title={aheadDate === todayIso ? 'นัดหมายรายคลินิก — วันนี้' : isLaterDay ? `นัดหมายรายคลินิก — ล่วงหน้า ${formatDmy(aheadDate)}` : 'นัดหมายรายคลินิก — พรุ่งนี้'}
              subtitle={aheadDay ? <><b>{formatDmy(aheadDay.date)}</b> · {aheadDate === todayIso ? 'นัดทั้งหมด' : 'นัดล่วงหน้า'} {aheadDay.total.toLocaleString('en-US')} ราย</> : 'กำลังโหลด...'}
              actions={<DatePicker value={aheadDate} min={todayIso} max={shiftIso(365)} quickPick={{ label: 'พรุ่งนี้', value: tomorrowIso }} onChange={setAheadDate} />}
            >
              {aheadDay ? <AppointmentClinicTable day={aheadDay} /> : <div className="sk sk-chart" style={{ height: 260 }} />}
            </Panel>
          </section>

          <section className={`report-row ${FEATURES.satisfaction ? 'cols-3' : 'cols-2'}`}>
            {/* ความพึงพอใจ (ซ่อน: FEATURES.satisfaction) */}
            {FEATURES.satisfaction && (
            <Panel num={num()} title="ความพึงพอใจผู้ป่วย และคุณภาพบริการ" printable>
              <div className="satisfaction">
                <div className="satisfaction-score">
                  <i className="fa-solid fa-face-smile" />
                  <b>{data.satisfaction.score} <small>/ 5</small></b>
                  <small>คะแนนความพึงพอใจ</small>
                  <span className="metric-change good"><i className="fa-solid fa-caret-up" />{data.satisfaction.change.toFixed(1)} <small>vs. ช่วงก่อน</small></span>
                </div>
                <div className="satisfaction-topics">
                  <small>หัวข้อที่ได้รับคะแนนสูงสุด</small>
                  <HBarList items={data.satisfaction.topics} max={5} color={C.violet} format={item => item.value.toFixed(1)} labelWidth={150} />
                </div>
              </div>
            </Panel>
            )}

            {/* Peak Hour */}
            <Panel num={num()} title="ช่วงเวลาที่หนาแน่นที่สุด (Peak Hour)" subtitle="เฉลี่ยต่อวันทำการ (ราย/ชั่วโมง) — แท่งสีแดงคือช่วงพีค" printable>
              <ReportChart
                labels={data.peakHours.map(p => p.label)}
                series={[{ label: 'จำนวนผู้ป่วย', data: data.peakHours.map(p => p.value), color: C.indigo }]}
                highlightIndex={data.peakHours.reduce((best, p, i, arr) => (p.value > arr[best].value ? i : best), 0)}
                showLegend={false}
                showValues
                height={240}
              />
            </Panel>

            {/* Alert */}
            <Panel num={num()} title="OPD Alert & Action" tone="danger" printable>
              <table className="report-table">
                <thead><tr><th>เรื่องที่ต้องติดตาม</th><th className="num">ค่า/สถานะ</th><th className="num">เป้าหมาย</th><th className="center">สถานะ</th></tr></thead>
                <tbody>
                  {alerts.map(alert => (
                    <tr key={alert.issue}>
                      <td><StatusIcon status={alert.status} /> {alert.issue}</td>
                      <td className={`num ${alert.status !== 'ok' ? `text-${alert.status}` : ''}`}>{alert.value}</td>
                      <td className="num muted">{alert.target}</td>
                      <td className="center"><StatusPill status={alert.status} /></td>
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
