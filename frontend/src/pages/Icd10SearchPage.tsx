import { useState } from 'react';
import FilterBar from '../components/FilterBar';
import KpiCard from '../components/KpiCard';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import Icd10Table from '../components/Icd10Table';
import Icd10BarChart, { type BarMode } from '../charts/Icd10BarChart';
import Icd10DonutChart from '../charts/Icd10DonutChart';
import { useIcd10Data } from '../hooks/useIcd10Data';
import { formatDmy, formatNumber } from '../utils/format';
import ExportPair from '../components/report/ExportPair';

const BAR_MODES: { key: BarMode; label: string }[] = [
  { key: 'both', label: 'แสดงคู่' },
  { key: 'visits', label: 'ครั้ง' },
  { key: 'patients', label: 'คน' },
];

export default function Icd10SearchPage() {
  const { filter, applyFilter, data, error, refresh } = useIcd10Data();
  const [barMode, setBarMode] = useState<BarMode>('both');
  const periodLabel = `วันที่ ${formatDmy(filter.start)} ถึง ${formatDmy(filter.end)}`;
  const top1 = data?.items[0];

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="ค้นหาผู้ป่วยตามโรค (ICD-10)"
        subtitle={<>สรุปอันดับโรคตามรหัสวินิจฉัยหลัก (pdx) ระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={<FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />}
      />

      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? (
        <PageSkeleton cards={4} rows={[2, 1]} />
      ) : (
        <>
          <section className="grid-4">
            <KpiCard
              accent="indigo" icon="fa-virus" title="จำนวนโรคทั้งหมด (ICD-10 Codes)"
              value={formatNumber(data.totals.codes)} unit="รหัสโรค"
              badgeIcon="fa-clipboard-check" badge="รหัสการวินิจฉัย" note="สะสมในช่วงที่เลือก"
            />
            <KpiCard
              accent="plum" icon="fa-users" title="ผู้รับบริการรวม (ไม่ซ้ำ HN)"
              value={formatNumber(data.totals.patients)} unit="คน"
              badgeIcon="fa-user-check" badge="Count Distinct HN" note="รวมทุกโรค"
            />
            <KpiCard
              accent="slate" icon="fa-notes-medical" title="จำนวนครั้งรับบริการรวม (Visits)"
              value={formatNumber(data.totals.visits)} unit="ครั้ง"
              badgeIcon="fa-book-medical" badge="Count VN/AN" note="OPD + IPD"
            />
            <KpiCard
              accent="amber" icon="fa-trophy" title="อันดับ 1 ที่พบมากที่สุด"
              value={top1 ? <span className="kpi-top1"><code className="icd-code">{top1.code}</code><span data-tip={top1.name}>{top1.name}</span></span> : '–'}
              badgeIcon="fa-fire" badge={top1 ? `${formatNumber(top1.visits)} ครั้ง` : '–'} note="สูงสุดประจำช่วงเวลา"
            />
          </section>

          <section className="chart-grid">
            <article className="card-box chart-card">
              <div className="chart-card-head">
                <div>
                  <strong><i className="fa-solid fa-chart-column" /> กราฟ 20 อันดับรหัสโรค (Top 20 ICD-10)</strong>
                  <small className="chart-sub">แสดงรหัสโรค (pdx) บนแกนกราฟ — นำเมาส์ชี้เพื่อดูชื่อโรคฉบับเต็ม</small>
                </div>
                <ExportPair title="กราฟ 20 อันดับรหัสโรค (Top 20 ICD-10)" />
                <div className="segmented">
                  {BAR_MODES.map(m => (
                    <button key={m.key} className={barMode === m.key ? 'active' : ''} onClick={() => setBarMode(m.key)}>{m.label}</button>
                  ))}
                </div>
              </div>
              <Icd10BarChart items={data.items.slice(0, 20)} mode={barMode} />
            </article>

            <article className="card-box chart-card">
              <div className="chart-card-head">
                <strong><i className="fa-solid fa-chart-pie" /> สัดส่วน Top 5 โรคหลัก</strong>
                <small className="chart-sub">ตามจำนวนครั้ง เทียบกับโรคอื่นทั้งหมด</small>
                <ExportPair title="สัดส่วน Top 5 โรคหลัก" />
              </div>
              <Icd10DonutChart items={data.items} totalVisits={data.totals.visits} totalCodes={data.totals.codes} />
            </article>
          </section>

          <Icd10Table items={data.items} start={filter.start} end={filter.end} periodLabel={periodLabel} />
        </>
      )}
    </>
  );
}
