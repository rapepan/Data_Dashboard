import { useState, type ReactNode } from 'react';
import KpiCard from '../KpiCard';
import Panel from './Panel';
import RankTable from './RankTable';
import ReportChart from '../../charts/ReportChart';
import type { ClinicOpd } from '../../types/reports';
import { formatDmy, formatNumber } from '../../utils/format';

interface ClinicOpdBlockProps {
  data: ClinicOpd;
  /** ชื่อคลินิก เช่น "แพทย์แผนไทย" */
  clinic: string;
  color: string;
  period: string;
  fiscalLabel: string;
  /** การ์ดเพิ่มท้ายแถว (เช่น ผู้ป่วย IMC ของแพทย์แผนจีน) */
  extraCard?: ReactNode;
  kind?: 'opd' | 'ipd';
}

type View = 'daily' | 'monthly';

/**
 * ผู้ป่วยนอกของคลินิก: การ์ดสรุป (วันนี้ / เดือนนี้ / ช่วงที่เลือก / เฉลี่ยต่อวัน)
 * + กราฟจำนวนคน (สลับรายวัน / รายเดือน) + 10 อันดับโรค (ICD-10)
 */
export default function ClinicOpdBlock({ data, clinic, color, period, fiscalLabel, extraCard, kind = 'opd' }: ClinicOpdBlockProps) {
  const [view, setView] = useState<View>('daily');
  const daily = view === 'daily';

  return (
    <>
      <section className={extraCard ? 'grid-5' : 'grid-4'}>
        <KpiCard accent="indigo" icon="fa-clock-rotate-left" title={`ผู้ป่วยนอก${clinic}วันนี้`} value={formatNumber(data.day.persons)} unit="คน" badgeIcon="fa-calendar-day" badge={formatDmy(data.day.date)} note={`${formatNumber(data.day.visits)} ครั้ง`} />
        <KpiCard accent="plum" icon="fa-calendar-check" title="เดือนนี้" value={formatNumber(data.month.persons)} unit="คน" badgeIcon="fa-calendar-days" badge={`${formatDmy(data.month.start)} – ${formatDmy(data.day.date)}`} note={`${formatNumber(data.month.visits)} ครั้ง`} />
        <KpiCard accent="amber" icon="fa-users" title="รวมช่วงที่เลือก" value={formatNumber(data.range.persons)} unit="คน" badgeIcon="fa-calendar-week" badge={period} note={`${formatNumber(data.range.visits)} ครั้ง`} />
        <KpiCard accent="slate" icon="fa-calculator" title="เฉลี่ยต่อวัน" value={data.avgPerDay.toFixed(1)} unit="คน/วัน" badgeIcon="fa-business-time" badge={`วันทำการ ${data.daily.dates.length} วัน`} />
        {extraCard}
      </section>

      <section className="report-row cols-2">
        <Panel
          title={`จำนวนผู้ป่วยนอก${clinic} (${daily ? 'รายวัน' : 'รายเดือน'})`}
          subtitle={daily ? `จำนวนคนต่อวันทำการ · ${period}` : `จำนวนคนรายเดือน · ${fiscalLabel}`}
          printable
          actions={
            <div className="segmented no-print">
              <button className={daily ? 'active' : ''} onClick={() => setView('daily')}>รายวัน</button>
              <button className={!daily ? 'active' : ''} onClick={() => setView('monthly')}>รายเดือน</button>
            </div>
          }
        >
          <ReportChart
            labels={daily ? data.daily.dates.map(d => formatDmy(d).slice(0, 5)) : data.monthly.labels}
            series={[{ label: 'ผู้ป่วย (คน)', data: daily ? data.daily.persons : data.monthly.persons, color, type: daily ? 'line' : 'bar', fill: daily }]}
            showLegend={false}
            showValues={!daily}
            height={300}
            printCategory={daily ? 'วันที่' : 'เดือน'}
          />
        </Panel>
        <Panel title={`อันดับโรค ผู้ป่วยนอก${clinic}`} subtitle={`รหัสโรค (ICD-10) · ${period}`} printable>
          <RankTable items={data.topDiseases} codeLabel="รหัส ICD-10" nameLabel="ชื่อโรค" kind={kind} />
        </Panel>
      </section>
    </>
  );
}
