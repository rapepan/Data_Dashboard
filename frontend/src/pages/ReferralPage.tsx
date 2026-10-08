import { useCallback, useState } from 'react';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import IcdTopSection from '../components/report/IcdTopSection';
import Select from '../components/ui/Select';
import { useReport } from '../hooks/useReport';
import { fetchReferralReport, type FetchOptions } from '../services/reportService';
import type { ReactNode } from 'react';
import type { Accent } from '../components/StatCard';
import { formatDmy, formatNumber } from '../utils/format';

const REFER_COLOR = '#0ea5e9';

interface ReferCardProps {
  accent: Accent;
  icon: string;
  title: string;
  value: string;
  unit: string;
  lines: { icon: string; label: string; value: string }[];
  change?: ReactNode;
}

function ReferCard({ accent, icon, title, value, unit, lines, change }: ReferCardProps) {
  return (
    <article className="card-box dental-card readmit-card" data-accent={accent}>
      <div className="dental-card-head">
        <div>
          <span className="dental-card-title">{title}</span>
          <span className="dental-card-value">{value} <small>{unit}</small></span>
          {change && <span className="card-change">{change}</span>}
        </div>
        <span className="card-icon lg"><i className={`fa-solid ${icon}`} /></span>
      </div>
      <div className="readmit-meta">
        {lines.map(line => <span key={line.label}><i className={`fa-solid ${line.icon}`} /> {line.label}: <b>{line.value}</b></span>)}
      </div>
    </article>
  );
}

export default function ReferralPage() {
  const [point, setPoint] = useState('all');
  // เปลี่ยนจุดส่งต่อ → fetcher เปลี่ยน → useReport โหลดใหม่
  const fetcher = useCallback((start: string, end: string, opts?: FetchOptions) => fetchReferralReport(start, end, point, opts), [point]);
  const { filter, applyFilter, data, lastData, error, refresh, compare } = useReport(fetcher, { compare: true });

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="สถิติการส่งต่อผู้ป่วย (Refer Out)"
        subtitle={<>ผู้ป่วยที่ส่งต่อไปรักษาที่โรงพยาบาลอื่น ระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={
          <div className="header-filters">
            <div className="ward-filter">
              <i className="fa-solid fa-signs-post" />
              <Select<string>
                ariaLabel="จุดส่งต่อ"
                value={point}
                options={(lastData?.points ?? [{ key: 'all', label: 'ทุกจุดส่งต่อ' }]).map(p => ({ value: p.key, label: p.label }))}
                onChange={setPoint}
              />
            </div>
            <FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />
          </div>
        }
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? <PageSkeleton cards={3} rows={[2]} /> : (() => {
        const pointLabel = data.points.find(p => p.key === data.point)?.label ?? 'ทุกจุดส่งต่อ';
        const range = `${formatDmy(data.start)} ถึง ${formatDmy(data.end)}`;
        return (
          <>
            <section className="report-row cols-3">
              <ReferCard
                accent="indigo" icon="fa-square-arrow-up-right" title="จำนวน REFER ทั้งหมด" value={formatNumber(data.total)} unit="คน" change={compare(r => r.total, 'down')}
                lines={[{ icon: 'fa-signs-post', label: 'จุดส่งต่อ', value: pointLabel }, { icon: 'fa-calendar-days', label: 'ช่วงวันที่', value: range }]}
              />
              <ReferCard
                accent="rose" icon="fa-clock-rotate-left" title="ส่งต่อวันนี้" value={formatNumber(data.day.count)} unit="คน"
                lines={[{ icon: 'fa-tower-broadcast', label: 'ข้อมูล', value: 'ณ วันสิ้นสุดที่เลือก' }, { icon: 'fa-calendar-day', label: 'วันที่', value: formatDmy(data.day.date) }]}
              />
              <ReferCard
                accent="plum" icon="fa-calculator" title="ค่าเฉลี่ยส่งต่อต่อวัน" value={data.avgPerDay.toFixed(1)} unit="คน/วัน" change={compare(r => r.avgPerDay, 'down')}
                lines={[{ icon: 'fa-hourglass-half', label: 'ระยะเวลารวม', value: `${data.days} วัน` }, { icon: 'fa-calendar-days', label: 'ช่วงวันที่', value: range }]}
              />
            </section>

            <IcdTopSection
              items={data.items}
              total={data.total}
              chartTitle="กราฟแสดงสถิติการส่งต่อผู้ป่วย (Top 10 ICD-10)"
              tableTitle="รายละเอียดข้อมูลการส่งต่อแยกตามรหัสโรค (Top 10)"
              subtitle={`${pointLabel} · ${range}`}
              color={REFER_COLOR}
              softColor="#e0f2fe"
              emptyText="ไม่มีการส่งต่อผู้ป่วย ในช่วงเวลาและจุดส่งต่อที่เลือก"
            />
          </>
        );
      })()}
    </>
  );
}
