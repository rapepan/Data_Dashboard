import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import KpiCard from '../components/KpiCard';
import Panel from '../components/report/Panel';
import DonutPanel from '../components/report/DonutPanel';
import DrugTable from '../components/report/DrugTable';
import ChangeBadge from '../components/report/ChangeBadge';
import ReportChart from '../charts/ReportChart';
import { useReport } from '../hooks/useReport';
import { fetchTelepharmacyReport } from '../services/reportService';
import { previousRange } from '../utils/compare';
import { formatDmy, formatNumber } from '../utils/format';

const RIGHT_COLORS = ['#4f46e5', '#8b5cf6', '#e11d48', '#0ea5e9', '#f59e0b', '#94a3b8', '#a21caf', '#64748b'];
const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '0%');

/**
 * Telepharmacy (เภสัชกรรมทางไกล) — ระยะแรก: การจ่ายยาให้ผู้ป่วยที่รับบริการทางไกล (visit แผนก 055 ที่มีรายการยา)
 * HOSxP ยังไม่มีบันทึกงานเภสัชกรให้คำปรึกษาทางไกลโดยตรง — เมื่อห้องยาเริ่มบันทึก ค่อยเพิ่มส่วนนั้นในหน้านี้
 */
export default function TelepharmacyPage() {
  const { filter, applyFilter, data, error, refresh } = useReport(fetchTelepharmacyReport);

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="Telepharmacy (เภสัชกรรมทางไกล)"
        subtitle={<>การจ่ายยาให้ผู้ป่วยที่รับบริการทางไกล ระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={<FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />}
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? <PageSkeleton cards={4} rows={[2, 2]} /> : (() => {
        const r = data.range;
        const period = `${formatDmy(data.start)} – ${formatDmy(data.end)}`;
        const otherTele = data.monthly.teleVisits.map((t, i) => Math.max(0, t - data.monthly.withDrug[i]));
        return (
          <>
            <div className="notice-bar telepharm-note">
              <i className="fa-solid fa-circle-info" />
              <span>
                ระยะแรก: แสดงการจ่ายยาให้ผู้ป่วยที่รับบริการทางไกล (แผนก 055 ที่มีรายการยา) — HOSxP ยังไม่มีบันทึกงานที่เภสัชกรให้คำปรึกษาทางไกลโดยตรง
                เมื่อห้องยาเริ่มบันทึก จะเพิ่มส่วนนั้นในหน้านี้
              </span>
            </div>

            <section className="grid-4">
              <KpiCard
                accent="indigo" icon="fa-prescription-bottle-medical" title="ผู้ป่วยทางไกลที่ได้รับยา" value={formatNumber(r.visits)} unit="ครั้ง"
                badgeIcon="fa-user" badge={`${formatNumber(r.persons)} คน`} note={`${pct(r.visits, r.teleVisits)} ของบริการทางไกล ${formatNumber(r.teleVisits)} ครั้ง`}
                change={<ChangeBadge change={r.change} goodWhen="none" range={previousRange(data.start, data.end)} />}
              />
              <KpiCard
                accent="plum" icon="fa-calendar-check" title="เดือนนี้" value={formatNumber(data.month.visits)} unit="ครั้ง"
                badgeIcon="fa-user" badge={`${formatNumber(data.month.persons)} คน`} note={`${formatDmy(data.month.start)} – ${formatDmy(data.day.date)}`}
              />
              <KpiCard
                accent="amber" icon="fa-calendar-days" title={`ปีงบประมาณ ${data.fiscalYear}`} value={formatNumber(data.fiscal.visits)} unit="ครั้ง"
                badgeIcon="fa-clock-rotate-left" badge={`วันนี้ ${formatNumber(data.day.visits)} ครั้ง`}
              />
              {data.showMoney ? (
                <KpiCard
                  accent="slate" icon="fa-coins" title="มูลค่ายา (ราคาขาย)" value={money.format(r.sale)} unit="บาท"
                  badgeIcon="fa-tags" badge={`ทุน ${money.format(r.cost)} บาท`} note={`${formatNumber(r.items)} รายการ · ${formatNumber(r.qty)} ชิ้น`}
                />
              ) : (
                <KpiCard
                  accent="slate" icon="fa-pills" title="รายการยาที่จ่าย" value={formatNumber(r.items)} unit="รายการ"
                  badgeIcon="fa-boxes-stacked" badge={`${formatNumber(r.qty)} ชิ้น`} note="มูลค่ายาแสดงเฉพาะผู้ที่เข้าสู่ระบบ"
                />
              )}
            </section>

            <section className="report-row cols-2">
              <Panel
                title="บริการทางไกลที่ได้รับยา / ไม่มียา รายเดือน"
                subtitle={`จำนวนครั้ง (แท่ง) และ % ที่ได้รับยา (เส้น) · ปีงบประมาณ ${data.fiscalYear}`}
                printable
              >
                <ReportChart
                  labels={data.monthly.labels}
                  stacked
                  height={300}
                  printCategory="เดือน"
                  rightAxis={{ suffix: '%', min: 0, max: 100 }}
                  series={[
                    { label: 'ได้รับยา (ครั้ง)', data: data.monthly.withDrug, color: '#4f46e5' },
                    { label: 'ไม่มียา (ครั้ง)', data: otherTele, color: '#cbd5e1' },
                    { label: '% ได้รับยา', type: 'line', axis: 'right', color: '#e11d48', data: data.monthly.withDrug.map((w, i) => (data.monthly.teleVisits[i] ? Math.round((w / data.monthly.teleVisits[i]) * 1000) / 10 : null)) },
                  ]}
                />
              </Panel>
              {data.showMoney ? (
                <Panel title="มูลค่ายา รายเดือน" subtitle={`ราคาทุน / ราคาขาย (บาท) · ปีงบประมาณ ${data.fiscalYear}`} printable>
                  <ReportChart
                    labels={data.monthly.labels}
                    height={300}
                    printCategory="เดือน"
                    series={[
                      { label: 'ราคาทุน', data: data.monthly.cost, color: '#94a3b8' },
                      { label: 'ราคาขาย', data: data.monthly.sale, color: '#8b5cf6' },
                    ]}
                  />
                </Panel>
              ) : (
                <Panel title="สิทธิการรักษา" subtitle={`ผู้ป่วยทางไกลที่ได้รับยา · ${period}`} printable>
                  <DonutPanel items={data.rights} colors={RIGHT_COLORS} size={210} valueLabel="ครั้ง" printCategory="สิทธิ" center={<><b>{formatNumber(r.visits)}</b><small>ครั้ง</small></>} />
                </Panel>
              )}
            </section>

            <section className={`report-row${data.showMoney ? ' cols-2-1' : ''}`}>
              <Panel title="อันดับยาที่จ่ายให้ผู้ป่วยทางไกล" subtitle={`${data.showMoney ? 'เรียงตามมูลค่าขาย' : 'เรียงตามจำนวนชิ้น'} · ${period}`} printable>
                <DrugTable
                  items={data.showMoney ? data.topDrugs : [...data.topDrugs].sort((a, b) => b.qty - a.qty)}
                  nameLabel="ชื่อยา"
                  searchPlaceholder="ค้นหาชื่อยา..."
                  accent="#4f46e5"
                  showMoney={data.showMoney}
                />
              </Panel>
              {data.showMoney && (
                <Panel title="สิทธิการรักษา" subtitle={`ผู้ป่วยทางไกลที่ได้รับยา · ${period}`} printable>
                  <DonutPanel items={data.rights} colors={RIGHT_COLORS} size={200} valueLabel="ครั้ง" printCategory="สิทธิ" legendPosition="bottom" center={<><b>{formatNumber(r.visits)}</b><small>ครั้ง</small></>} />
                </Panel>
              )}
            </section>
          </>
        );
      })()}
    </>
  );
}
