import { useCallback, useState } from 'react';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import IcdTopSection from '../components/report/IcdTopSection';
import Select from '../components/ui/Select';
import { useReport } from '../hooks/useReport';
import { fetchReadmitReport } from '../services/reportService';
import { formatDmy, formatNumber } from '../utils/format';

const READMIT_COLOR = '#e11d48';

export default function ReadmitPage() {
  const [ward, setWard] = useState('all');
  // เปลี่ยนหอผู้ป่วย → fetcher เปลี่ยน → useReport โหลดใหม่
  const fetcher = useCallback((start: string, end: string) => fetchReadmitReport(start, end, ward), [ward]);
  const { filter, applyFilter, data, lastData, error, refresh } = useReport(fetcher);

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="ข้อมูลการกลับมารักษาซ้ำ (Re-admit 28 วัน)"
        subtitle={<>ผู้ป่วยที่กลับมานอนโรงพยาบาลซ้ำภายใน 28 วันหลังจำหน่าย ระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={
          <div className="header-filters">
            <div className="ward-filter">
              <i className="fa-solid fa-bed-pulse" />
              <Select<string>
                ariaLabel="หอผู้ป่วย"
                value={ward}
                options={(lastData?.wards ?? [{ key: 'all', label: 'ทุกหอผู้ป่วย' }]).map(w => ({ value: w.key, label: w.label }))}
                onChange={setWard}
              />
            </div>
            <FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />
          </div>
        }
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? <PageSkeleton cards={2} rows={[2]} /> : (() => {
        const wardLabel = data.wards.find(w => w.key === data.ward)?.label ?? 'ทุกหอผู้ป่วย';
        const meta = (
          <div className="readmit-meta">
            <span><i className="fa-solid fa-bed-pulse" /> หอผู้ป่วย: <b>{wardLabel}</b></span>
            <span><i className="fa-solid fa-calendar-days" /> ช่วงวันที่: <b>{formatDmy(data.start)} ถึง {formatDmy(data.end)}</b></span>
          </div>
        );
        return (
          <>
            <section className="report-row cols-2">
              <article className="card-box dental-card readmit-card" data-accent="rose">
                <div className="dental-card-head">
                  <div>
                    <span className="dental-card-title">จำนวน RE-ADMIT ทั้งหมด (ครั้ง)</span>
                    <span className="dental-card-value">{formatNumber(data.visits)} <small>ครั้ง</small></span>
                  </div>
                  <span className="card-icon lg"><i className="fa-solid fa-arrows-rotate" /></span>
                </div>
                {meta}
              </article>
              <article className="card-box dental-card readmit-card" data-accent="amber">
                <div className="dental-card-head">
                  <div>
                    <span className="dental-card-title">จำนวน RE-ADMIT ทั้งหมด (คน)</span>
                    <span className="dental-card-value">{formatNumber(data.persons)} <small>คน</small></span>
                  </div>
                  <span className="card-icon lg"><i className="fa-solid fa-user-injured" /></span>
                </div>
                {meta}
              </article>
            </section>

            <IcdTopSection
              items={data.items}
              total={data.visits}
              chartTitle="กราฟแสดงสถิติ Re-admit (Top 10 ICD-10)"
              tableTitle="รายละเอียดข้อมูล Re-admit แยกตามรหัสโรค (Top 10)"
              subtitle={wardLabel}
              color={READMIT_COLOR}
              softColor="#fff1f2"
              emptyText="ไม่มีผู้ป่วยกลับมานอนซ้ำภายใน 28 วัน ในช่วงเวลาและหอผู้ป่วยที่เลือก"
            />
          </>
        );
      })()}
    </>
  );
}
