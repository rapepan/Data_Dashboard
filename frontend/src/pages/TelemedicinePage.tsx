import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import StatCard from '../components/StatCard';
import Panel from '../components/report/Panel';
import DonutPanel from '../components/report/DonutPanel';
import ReportChart from '../charts/ReportChart';
import { useReport } from '../hooks/useReport';
import { fetchTelemedicineReport } from '../services/reportService';
import { formatDmy, formatNumber } from '../utils/format';

const CLINIC_COLORS = ['#4f46e5', '#8b5cf6', '#e11d48', '#0ea5e9', '#f59e0b', '#94a3b8'];

const withUnit = (value: number | string, unit: string) => <>{typeof value === 'number' ? formatNumber(value) : value} <small className="stat-unit">{unit}</small></>;

export default function TelemedicinePage() {
  const { filter, applyFilter, data, error, refresh, compare } = useReport(fetchTelemedicineReport, { compare: true });

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="การแพทย์ทางไกล (Telemedicine)"
        subtitle={<>สถิติผู้รับบริการทางไกล ระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={<FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />}
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? <PageSkeleton cards={4} rows={[2, 1]} /> : (() => {
        const hasClinics = data.clinics.some(c => c.value > 0);
        return (
          <>
            <section className="grid-4">
              <StatCard
                accent="indigo" icon="fa-laptop-medical" tooltip="จำนวนผู้รับบริการทางไกลในวันสิ้นสุดที่เลือก"
                title={`ผู้รับบริการทางไกล ประจำวันที่ ${formatDmy(data.day.date)}`} value={withUnit(data.day.total, 'ราย')}
                parts={[
                  { label: 'มาตามนัด', value: data.day.fromAppointment, tone: 'plum' },
                  { label: 'ไม่ได้นัด', value: data.day.walkin, tone: 'sky' },
                ]}
                foot="สถิติรายวันเรียลไทม์"
              />
              <StatCard
                accent="plum" icon="fa-calendar-week" tooltip="จำนวนผู้รับบริการทางไกลในเดือนของวันสิ้นสุด นับถึงวันนั้น"
                title="ผู้รับบริการทางไกล เดือนนี้" value={withUnit(data.month.total, 'ราย')}
                parts={[
                  { label: 'ตรวจสอบสิทธิ์รักษา', value: data.month.rightVerifiedPct, display: `${data.month.rightVerifiedPct}%`, tone: 'indigo' },
                  { label: 'สะสม', value: data.month.total, tone: 'sky' },
                ]}
                foot="สถิติสะสมรายเดือนปัจจุบัน"
              />
              <StatCard
                accent="rose" icon="fa-calendar-days" tooltip="จำนวนผู้รับบริการทางไกลสะสมในปีงบประมาณ นับถึงวันสิ้นสุด"
                title={`ผู้รับบริการทางไกล ปีงบประมาณ ${data.fiscalYear}`} value={withUnit(data.fiscal.total, 'ราย')}
                parts={[{ label: 'สะสมรวม', value: data.fiscal.total, tone: 'amber' }]}
                foot="ปีงบประมาณสะสมปัจจุบัน"
              />
              <StatCard
                accent="amber" icon="fa-calculator" tooltip="จำนวนผู้รับบริการในช่วงที่เลือก หารด้วยจำนวนวันทำการ"
                title="เฉลี่ยจำนวนผู้รับบริการทางไกล / วัน" value={withUnit(data.range.avgPerDay.toFixed(1), 'ราย/วัน')} change={compare(r => r.range.avgPerDay)}
                parts={[
                  { label: 'รวมในช่วงที่เลือก', value: data.range.total, tone: 'indigo' },
                  { label: 'วันทำการ', value: data.range.workdays, tone: 'sky' },
                ]}
                foot="ค่าเฉลี่ยต่อวันทำการ (ไม่นับเสาร์-อาทิตย์)"
              />
            </section>

            <section className="report-row cols-2">
              <Panel title="สถิติจำนวนผู้ใช้บริการรายชั่วโมง (Telemedicine Hourly Flow)" subtitle={`ประจำวันที่ ${formatDmy(data.day.date)}`} printable>
                <ReportChart
                  labels={data.hourly.labels}
                  series={[{ label: 'ผู้รับบริการ', data: data.hourly.values, color: '#0ea5e9', type: 'line', fill: true }]}
                  showLegend={false}
                  height={280}
                  printCategory="ช่วงเวลา"
                />
              </Panel>
              <Panel title="สัดส่วนคลินิกที่ให้บริการการแพทย์ทางไกล" subtitle={`ปีงบประมาณ ${data.fiscalYear}`} printable>
                {hasClinics ? (
                  <DonutPanel items={data.clinics} colors={CLINIC_COLORS} size={210} valueLabel="จำนวนครั้ง" printCategory="คลินิก" />
                ) : (
                  <p className="empty-note"><i className="fa-solid fa-inbox" /> ยังไม่มีข้อมูลในปีงบประมาณนี้</p>
                )}
              </Panel>
            </section>

            <Panel
              title="กราฟจำนวนการบริการทางไกล เป็นรายเดือน (Monthly Telemedicine Services)"
              subtitle={`จำนวนครั้งการให้บริการปรึกษาทางไกล รายเดือน (ปีงบประมาณ ${data.fiscalYear}: 1 ต.ค. – 30 ก.ย.)`}
              printable
            >
              <ReportChart
                labels={data.monthly.labels}
                series={[{ label: 'จำนวนครั้ง', data: data.monthly.values, color: '#8b5cf6' }]}
                showLegend={false}
                showValues
                height={300}
                printCategory="เดือน"
              />
            </Panel>
          </>
        );
      })()}
    </>
  );
}
