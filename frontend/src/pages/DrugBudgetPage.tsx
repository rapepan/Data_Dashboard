import { useEffect, useState } from 'react';
import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import KpiCard from '../components/KpiCard';
import Panel from '../components/report/Panel';
import DrugTable from '../components/report/DrugTable';
import DrugPicker from '../components/report/DrugPicker';
import ReportChart from '../charts/ReportChart';
import { useReport } from '../hooks/useReport';
import { SKELETON_MIN_MS } from '../hooks/useMinDelay';
import { fetchDrugBudgetReport, fetchDrugCompare } from '../services/reportService';
import { ApiError } from '../services/apiClient';
import type { DrugCatalogItem, DrugCompare } from '../types/reports';
import { formatDmy, formatNumber } from '../utils/format';

const HERB_COLOR = '#8b5cf6';
const COMMON_COLOR = '#0ea5e9';
/** ปีเก่า → ปีล่าสุด */
const YEAR_COLORS = ['#c7d2fe', '#818cf8', '#4f46e5'];

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function changePct(current: number, previous: number) {
  return previous ? ((current - previous) / previous) * 100 : 0;
}

/** เปรียบเทียบยา 1 รายการย้อนหลัง 3 ปีงบประมาณ */
function DrugCompareView({ compare }: { compare: DrugCompare }) {
  const { drug, years, monthly } = compare;
  return (
    <div className="compare-view">
      <div className="compare-years">
        {years.map((year, i) => {
          const prev = years[i - 1];
          const change = prev ? changePct(year.qty, prev.qty) : null;
          return (
            <div key={year.fiscalYear} className={i === years.length - 1 ? 'latest' : ''} style={{ ['--c' as string]: YEAR_COLORS[i] }}>
              <span className="compare-fy">ปีงบประมาณ {year.fiscalYear}{i === years.length - 1 && ' (ปัจจุบัน)'}</span>
              <b>{formatNumber(year.qty)} <small>{drug.unit}</small></b>
              <em>{money.format(year.value)} บาท</em>
              {change !== null && (
                <span className={`metric-change ${change >= 0 ? 'good' : 'bad'}`}>
                  <i className={`fa-solid ${change >= 0 ? 'fa-caret-up' : 'fa-caret-down'}`} />
                  {Math.abs(change).toFixed(1)}% <small>vs. ปีก่อน</small>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <ReportChart
        labels={monthly.labels}
        height={280}
        printTable="total"
        printCategory="เดือน"
        series={years.map((year, i) => ({ label: `ปีงบ ${year.fiscalYear}`, data: monthly.qty[i], color: YEAR_COLORS[i] }))}
      />
      <p className="panel-foot-note">ปีงบประมาณปัจจุบันนับถึงวันสิ้นสุดที่เลือก — เดือนที่ยังไม่ถึงแสดงเป็น 0</p>
    </div>
  );
}

export default function DrugBudgetPage() {
  const { filter, applyFilter, data, error, refresh } = useReport(fetchDrugBudgetReport);
  const [drug, setDrug] = useState<DrugCatalogItem | null>(null);
  const [compare, setCompare] = useState<DrugCompare | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  // ผลเปรียบเทียบที่ได้ล่าสุดเป็นของยา/วันไหน — ยังไม่ตรงกับที่เลือก = กำลังโหลด (แสดง Skeleton)
  const [compareFor, setCompareFor] = useState<string | null>(null);
  const compareKey = drug ? `${drug.code}|${filter.end}` : null;
  const compareLoading = compareKey !== null && compareFor !== compareKey;

  // เลือกยา (หรือเปลี่ยนวันสิ้นสุด) → โหลดข้อมูลเปรียบเทียบ 3 ปี
  useEffect(() => {
    if (!drug) return;
    let cancelled = false;
    const started = Date.now();
    const key = `${drug.code}|${filter.end}`;
    fetchDrugCompare(drug.code, filter.end)
      .then(async result => {
        const wait = SKELETON_MIN_MS - (Date.now() - started);
        if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
        if (!cancelled) { setCompare(result); setCompareError(null); setCompareFor(key); }
      })
      .catch(err => { if (!cancelled) { setCompareError(err instanceof ApiError ? err.message : 'โหลดข้อมูลเปรียบเทียบไม่สำเร็จ'); setCompareFor(key); } });
    return () => { cancelled = true; };
  }, [drug, filter.end]);

  const selectDrug = (next: DrugCatalogItem | null) => {
    setDrug(next);
    if (!next) setCompare(null);
  };

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="ปริมาณการใช้ยา"
        subtitle={<>ปริมาณและมูลค่าการใช้ยา ระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={<FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />}
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? <PageSkeleton cards={4} rows={[1, 2]} /> : (() => {
        const period = `${formatDmy(data.start)} – ${formatDmy(data.end)}`;
        const years = compare?.years.map(y => y.fiscalYear).reverse().join(', ');
        return (
          <>
            <section className="grid-4">
              <KpiCard accent="indigo" icon="fa-boxes-stacked" title="ปริมาณการใช้ยารวม" value={formatNumber(data.totals.qty)} unit="ชิ้น" badgeIcon="fa-calendar-days" badge={period} />
              <KpiCard accent="plum" icon="fa-coins" title="มูลค่าการใช้ยารวม" value={money.format(data.totals.value)} unit="บาท" badgeIcon="fa-calendar-days" badge={period} />
              <KpiCard accent="plum" icon="fa-seedling" title="มูลค่าการใช้ยาสมุนไพร" value={money.format(data.totals.herbValue)} unit="บาท" badgeIcon="fa-calendar-days" badge={period} />
              <KpiCard accent="indigo" icon="fa-capsules" title="มูลค่าการใช้ยาสามัญ" value={money.format(data.totals.commonValue)} unit="บาท" badgeIcon="fa-calendar-days" badge={period} />
            </section>

            <Panel
              title="เปรียบเทียบปริมาณและมูลค่าการใช้ยารายการ (ย้อนหลัง 3 ปี)"
              subtitle={compare ? `${compare.drug.code} · ${compare.drug.name} — ปีงบประมาณ ${years}` : 'เลือกรายการยาเพื่อดูสถิติตามปีงบประมาณปัจจุบันย้อนหลัง 3 ปี'}
              printable={Boolean(compare)}
              className="mb-row compare-panel"
              actions={<DrugPicker catalog={data.catalog} value={drug} onChange={selectDrug} />}
            >
              {compareError && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{compareError}</span></div>}
              {compareLoading ? (
                <div className="compare-loading" role="status" aria-label="กำลังโหลดข้อมูลเปรียบเทียบ">
                  <div className="compare-loading-tiles">{[0, 1, 2].map(i => <span key={i} className="sk sk-tile" />)}</div>
                  <span className="sk sk-chart" />
                </div>
              ) : compare && drug ? (
                <DrugCompareView compare={compare} />
              ) : (
                <div className="compare-empty">
                  <i className="fa-solid fa-hand-pointer" />
                  <strong>กรุณาเลือกหรือพิมพ์ค้นหารายการยาในช่องด้านบน</strong>
                  <small>ระบบจะดึงข้อมูลปริมาณการใช้และมูลค่ารวมย้อนหลัง 3 ปีงบประมาณมาเปรียบเทียบให้อัตโนมัติ</small>
                </div>
              )}
            </Panel>

            <section className="report-row cols-2">
              <Panel title="อันดับการใช้ยาสมุนไพร" subtitle={`ช่วงวันที่: ${period}`} printable>
                <DrugTable items={data.topDrugs.herb} nameLabel="ชื่อยาสมุนไพร" searchPlaceholder="ค้นหายาสมุนไพร..." accent={HERB_COLOR} />
              </Panel>
              <Panel title="อันดับการใช้ยาสามัญ" subtitle={`ช่วงวันที่: ${period}`} printable>
                <DrugTable items={data.topDrugs.common} nameLabel="ชื่อยาสามัญ" searchPlaceholder="ค้นหายาสามัญ..." accent={COMMON_COLOR} />
              </Panel>
            </section>
          </>
        );
      })()}
    </>
  );
}
