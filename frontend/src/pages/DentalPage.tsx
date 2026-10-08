import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import { useState, type ReactNode } from 'react';
import Panel from '../components/report/Panel';
import TopLimitSelect from '../components/report/TopLimitSelect';
import DonutPanel from '../components/report/DonutPanel';
import ReportChart from '../charts/ReportChart';
import { useReport } from '../hooks/useReport';
import { fetchDentalReport } from '../services/reportService';
import type { DentalBreakdown, LabelValue } from '../types/reports';
import type { Accent } from '../components/StatCard';
import { formatDmy, formatNumber } from '../utils/format';

/** สีตามกลุ่มหัตถการ (dttm_group): ตรวจ / ทันตกรรมหัตถการ / ปริทันต์ / ทันตศัลยกรรม / อื่น ๆ (ไม่ใช้สีเขียวตามธีมระบบ) */
const CATEGORY_COLORS = ['#e11d48', '#0ea5e9', '#8b5cf6', '#f59e0b', '#94a3b8'];

interface SummaryCardProps {
  accent: Accent;
  icon: string;
  title: string;
  note: string;
  data: DentalBreakdown;
  categories: string[];
  change?: ReactNode;
}

/** การ์ดสรุป: จำนวนผู้ป่วย + จำนวนครั้งแยก 5 ประเภท */
function SummaryCard({ accent, icon, title, note, data, categories, change }: SummaryCardProps) {
  return (
    <article className="card-box dental-card" data-accent={accent}>
      <div className="dental-card-head">
        <div>
          <span className="dental-card-title">{title}</span>
          <span className="dental-card-value">{formatNumber(data.patients)} <small>ราย</small></span>
          {change && <span className="card-change">{change}</span>}
          <span className="dental-card-note">{note}</span>
        </div>
        <span className="card-icon lg"><i className={`fa-solid ${icon}`} /></span>
      </div>
      <div className="dental-chips">
        {categories.map((category, i) => (
          <div key={category}>
            <small style={{ color: CATEGORY_COLORS[i] }}>{category.replace('หัตถการ', '')}</small>
            <b>{formatNumber(data.counts[i] ?? 0)}</b>
          </div>
        ))}
      </div>
    </article>
  );
}

/** อันดับหัตถการทันตกรรม — เลือก Top N ได้ */
function ProcedurePanel({ items, fiscalYear }: { items: LabelValue[]; fiscalYear: number }) {
  const [limit, setLimit] = useState(10);
  const topMax = Math.max(1, ...items.map(p => p.value));
  return (
    <Panel printable title={`${limit} อันดับหัตถการผู้ป่วยทันตกรรม`} subtitle={`สะสมปีงบประมาณ ${fiscalYear}`} actions={<TopLimitSelect value={limit} onChange={setLimit} />}>
      <table className="report-table procedure-table">
        <thead><tr><th className="center">#</th><th>ชื่อหัตถการทันตกรรม</th><th className="num">จำนวน</th></tr></thead>
        <tbody>
          {items.slice(0, limit).map((procedure, i) => (
            <tr key={procedure.label}>
              <td className="center rank-cell">{i + 1}</td>
              <td>
                <span className="procedure-name">{procedure.label}</span>
                <span className="procedure-bar"><span style={{ width: `${(procedure.value / topMax) * 100}%` }} /></span>
              </td>
              <td className="num"><b>{formatNumber(procedure.value)}</b> <small className="muted">ครั้ง</small></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

export default function DentalPage() {
  const { filter, applyFilter, data, error, refresh, compare } = useReport(fetchDentalReport, { compare: true });

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="ทันตกรรม"
        subtitle={<>สถิติผู้รับบริการคลินิกทันตกรรม ระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={<FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />}
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? <PageSkeleton cards={3} rows={[2, 1]} /> : (() => {
        return (
          <>
            <section className="report-row cols-3">
              <SummaryCard
                accent="indigo" icon="fa-calendar-days" title="ผู้ป่วยทันตกรรมรวมในช่วงที่เลือก"
                note={`${formatDmy(data.start)} – ${formatDmy(data.end)}`}
                data={data.range} categories={data.categories} change={compare(r => r.range.patients)}
              />
              <SummaryCard
                accent="plum" icon="fa-calendar-check" title="ผู้ป่วยทันตกรรมประจำเดือน"
                note={`สถิติสะสมทั้งเดือน (${formatDmy(data.month.start)} – ${formatDmy(data.month.end)})`}
                data={data.month} categories={data.categories}
              />
              <SummaryCard
                accent="amber" icon="fa-clock-rotate-left" title="ผู้ป่วยทันตกรรมประจำวัน"
                note={`ประจำวันที่ ${formatDmy(data.day.date)}`}
                data={data.day} categories={data.categories}
              />
            </section>

            <section className="report-row cols-1-2">
              <Panel title="สัดส่วนประเภทการรักษาทันตกรรม" subtitle={`ปีงบประมาณ ${data.fiscalYear} (จำนวนครั้ง)`} printable>
                <DonutPanel
                  items={data.categories.map((label, i) => ({ label, value: data.fiscalShare[i] }))}
                  colors={CATEGORY_COLORS}
                  center={<><b>{formatNumber(data.fiscalShare.reduce((a, b) => a + b, 0))}</b><small>ครั้ง</small></>}
                  size={220}
                  legendPosition="bottom"
                />
              </Panel>

              <ProcedurePanel items={data.topProcedures} fiscalYear={data.fiscalYear} />
            </section>

            <Panel title="จำนวนผู้มารับบริการทันตกรรม รายเดือน" subtitle={`จำแนกตามประเภทการรักษา 12 เดือน (ปีงบประมาณ ${data.fiscalYear}: 1 ต.ค. – 30 ก.ย.)`} printable>
              <ReportChart
                labels={data.monthly.labels}
                stacked
                height={300}
                series={data.categories.map((label, i) => ({ label, data: data.monthly.counts[i], color: CATEGORY_COLORS[i] }))}
              />
            </Panel>
          </>
        );
      })()}
    </>
  );
}
