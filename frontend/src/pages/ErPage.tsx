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
import { fetchErReport } from '../services/reportService';
import type { AlertStatus, LabelValue } from '../types/reports';
import { FEATURES, panelNumbers } from '../config/features';
import { formatDmy } from '../utils/format';

const C = { indigo: '#4f46e5', violet: '#8b5cf6', amber: '#f59e0b', orange: '#f97316', rose: '#e11d48', slate: '#94a3b8', sky: '#0ea5e9' };
/** สีระดับ Triage: 1 แดง, 2 ส้ม, 3 เหลือง, 4 ฟ้า, 5 เทา (ไม่ใช้สีเขียวตามธีมระบบ) */
const TRIAGE_COLORS = [C.rose, C.orange, C.amber, C.sky, C.slate];
const FLOW_ICONS = ['fa-person-walking', 'fa-clipboard-check', 'fa-heart-pulse', 'fa-hourglass-half', 'fa-user-doctor', 'fa-droplet', 'fa-capsules', 'fa-door-open'];
const ALERT_LABEL: Record<AlertStatus, string> = { critical: 'เร่งดำเนินการ', warning: 'ติดตาม', ok: 'ปกติ' };

export default function ErPage() {
  const { filter, applyFilter, data, error, refresh } = useReport(fetchErReport);

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="ER KPI Summary — ภาพรวมการให้บริการห้องฉุกเฉิน"
        subtitle={<>ข้อมูลระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={<FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />}
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? <PageSkeleton cards={5} rows={[2, 2]} /> : (() => {
        // ขั้นที่ผู้ป่วยค้างมากที่สุด (ไม่นับจุดเริ่มต้น Arrival)
        const busiest = data.flow.reduce((best, step, i, arr) => (i > 0 && step.value > arr[best].value ? i : best), 1);
        const losTotal = data.losBuckets.reduce((sum, b) => sum + b.value, 0);
        const overSix = data.losBuckets[data.losBuckets.length - 1];
        // ส่วนที่ซ่อนไว้กำหนดที่ config/features.ts
        const num = panelNumbers();
        const kpiCount = 5 + (FEATURES.erTimes ? 1 : 0) + (FEATURES.satisfaction ? 1 : 0);
        const row1 = 2 + (FEATURES.erTimes ? 1 : 0);
        const row3 = 1 + (FEATURES.erTimes ? 1 : 0) + (FEATURES.erResources ? 1 : 0) + (FEATURES.erAlerts ? 1 : 0);
        return (
          <>
            {/* 1. KPI */}
            <section className={`grid-${kpiCount}`}>
              <MetricTile accent="indigo" icon="fa-users" label="ผู้ป่วยทั้งหมด" metric={data.kpis.total} unit="ราย" />
              <MetricTile accent="rose" icon="fa-heart-circle-exclamation" label="ผู้ป่วยฉุกเฉิน (Triage 1-2)" metric={data.kpis.emergency} unit="ราย" />
              {FEATURES.erTimes && <MetricTile accent="amber" icon="fa-hourglass-half" label="เวลาเฉลี่ยรอพบแพทย์" metric={data.kpis.avgWaitDoctor} unit="นาที" goodWhen="down" />}
              <MetricTile accent="plum" icon="fa-bed-pulse" label="รับไว้ใน (Admit)" metric={data.kpis.admit} unit="ราย" />
              <MetricTile accent="slate" icon="fa-house" label="กลับบ้าน (Discharge)" metric={data.kpis.discharge} unit="ราย" />
              <MetricTile accent="indigo" icon="fa-right-left" label="ส่งต่อ (Transfer)" metric={data.kpis.transfer} unit="ราย" goodWhen="down" />
              {FEATURES.satisfaction && <MetricTile accent="amber" icon="fa-face-smile" label="ความพึงพอใจผู้ป่วย" metric={data.kpis.satisfaction} display={<>{data.kpis.satisfaction.value}<small>/ 5</small></>} />}
            </section>

            <section className={`report-row cols-${row1}`}>
              {/* ตามช่วงเวลา */}
              <Panel printable num={num()} title="จำนวนผู้ป่วยตามช่วงเวลา" subtitle={<>ช่วงเวลา <b>{data.byHour.peakLabel}</b> มีผู้ป่วยมากที่สุด {data.byHour.peakValue.toLocaleString('en-US')} ราย ({data.byHour.peakPct}%)</>}>
                <ReportChart
                  labels={data.byHour.labels}
                  stacked
                  series={[
                    { label: 'Triage 1', data: data.byHour.triage1, color: TRIAGE_COLORS[0] },
                    { label: 'Triage 2', data: data.byHour.triage2, color: TRIAGE_COLORS[1] },
                    { label: 'Triage 3', data: data.byHour.triage3, color: TRIAGE_COLORS[2] },
                    { label: 'Triage 4-5', data: data.byHour.triage45, color: TRIAGE_COLORS[3] },
                  ]}
                />
              </Panel>

              {/* Triage */}
              <Panel num={num()} title="สัดส่วนผู้ป่วยตามระดับความเร่งด่วน" subtitle="Triage Level" printable>
                <DonutPanel items={data.triage} colors={TRIAGE_COLORS} size={160} />
              </Panel>

              {/* เวลาแต่ละขั้นตอน (ซ่อน: FEATURES.erTimes) */}
              {FEATURES.erTimes && (
              <Panel num={num()} title="เวลาเฉลี่ยในแต่ละขั้นตอน (นาที)" subtitle="แท่งสีแดง = เกินเป้าหมาย" printable>
                <HBarList
                  items={data.stepTimes.map(s => ({ label: s.step, value: s.minutes }))}
                  colorOf={(_, i) => (data.stepTimes[i].minutes > data.stepTimes[i].targetMinutes ? C.rose : C.indigo)}
                  format={item => `${item.value} นาที`}
                  labelWidth={170}
                />
              </Panel>
              )}
            </section>

            <section className={`report-row ${FEATURES.erFlow ? 'cols-2-1' : 'cols-2'}`}>
              {/* Flow (ซ่อน: FEATURES.erFlow) */}
              {FEATURES.erFlow && (
              <Panel num={num()} title="ER Patient Flow" subtitle="จำนวนผู้ป่วยในแต่ละขั้นตอน" printable>
                <FlowSteps steps={data.flow} icons={FLOW_ICONS} highlightIndex={busiest} />
              </Panel>
              )}

              {/* Disposition */}
              <Panel num={num()} title="การรับไว้ใน / จำหน่าย / ส่งต่อ" printable>
                <DonutPanel items={data.disposition} colors={[C.indigo, C.violet, C.orange]} size={150} />
              </Panel>

              {/* สาเหตุ — ถ้าซ่อนแถวล่างทั้งหมด ย้ายมาคู่กับการจำหน่าย */}
              {!FEATURES.erFlow && row3 === 1 && <CausePanel num={num()} causes={data.topCauses} total={data.kpis.total.value} />}
            </section>

            {(row3 > 1 || FEATURES.erFlow) && (
            <section className={`report-row ${row3 > 1 ? `cols-${row3}` : ''}`}>
              {/* LOS (ซ่อน: FEATURES.erTimes) */}
              {FEATURES.erTimes && (
              <Panel num={num()} title="ระยะเวลาที่อยู่ใน ER (LOS)" printable>
                <div className="callout-critical">
                  ผู้ป่วยที่อยู่ใน ER &gt; 6 ชั่วโมง <b>{overSix.value.toLocaleString('en-US')} ราย ({Math.round((overSix.value / losTotal) * 100)}%)</b>
                  <small>ควรติดตามและเร่งรัดการจำหน่าย</small>
                </div>
                <ReportChart
                  labels={data.losBuckets.map(b => b.label)}
                  series={[{ label: 'ผู้ป่วย', data: data.losBuckets.map(b => b.value), color: C.indigo }]}
                  highlightIndex={data.losBuckets.length - 1}
                  showLegend={false}
                  showValues
                  height={190}
                />
              </Panel>
              )}

              {/* ทรัพยากร (ซ่อน: FEATURES.erResources) */}
              {FEATURES.erResources && (
              <Panel num={num()} title="ทรัพยากรและภาระงาน" printable>
                <ul className="resource-list">
                  {data.resources.map(r => {
                    const pct = Math.round((r.used / r.total) * 100);
                    return (
                      <li key={r.label}>
                        <div><span>{r.label}</span><b>{r.used} / {r.total}</b></div>
                        <span className="resource-bar"><span style={{ width: `${pct}%`, background: pct >= 85 ? C.rose : pct >= 75 ? C.orange : C.indigo }} /></span>
                        <em>{pct}%</em>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
              )}

              {/* สาเหตุ */}
              <CausePanel num={num()} causes={data.topCauses} total={data.kpis.total.value} />

              {/* Alert (ซ่อน: FEATURES.erAlerts) */}
              {FEATURES.erAlerts && (
              <Panel num={num()} title="Alert & Action" tone="danger" printable>
                <ul className="alert-list">
                  {data.alerts.map(alert => (
                    <li key={alert.issue}>
                      <StatusIcon status={alert.status} />
                      <span>{alert.issue}</span>
                      <StatusPill status={alert.status} label={ALERT_LABEL[alert.status]} />
                    </li>
                  ))}
                </ul>
              </Panel>
              )}
            </section>
            )}
          </>
        );
      })()}
    </>
  );
}

/** Top 5 สาเหตุการมา ER */
function CausePanel({ num, causes, total }: { num: number; causes: LabelValue[]; total: number }) {
  return (
    <Panel num={num} title="Top 5 สาเหตุการมา ER" printable>
      <ol className="cause-list">
        {causes.map((cause, i) => (
          <li key={cause.label}>
            <span className="cause-rank">{i + 1}</span>
            <span className="cause-label">{cause.label}</span>
            <b>{cause.value.toLocaleString('en-US')}</b>
            <small>({((cause.value / total) * 100).toFixed(1)}%)</small>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
