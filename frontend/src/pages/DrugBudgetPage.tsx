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

const MODERN_COLOR = '#0ea5e9';
const THAI_COLOR = '#8b5cf6';
const INHOUSE_COLOR = '#d97706';

type EdFilter = 'all' | 'ed' | 'ned';
const ED_FILTERS: { value: EdFilter; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'ed', label: 'ในบัญชี' },
  { value: 'ned', label: 'นอกบัญชี' },
];
/** ปีเก่า → ปีล่าสุด */
const YEAR_COLORS = ['#c7d2fe', '#818cf8', '#4f46e5'];

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function changePct(current: number, previous: number) {
  return previous ? ((current - previous) / previous) * 100 : 0;
}

/** เปรียบเทียบยา 1 รายการย้อนหลัง 3 ปีงบประมาณ */
function DrugCompareView({ compare, showMoney }: { compare: DrugCompare; showMoney: boolean }) {
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
              {showMoney && <em>ขาย {money.format(year.value)} · ทุน {money.format(year.cost)} บาท</em>}
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
  const [edFilter, setEdFilter] = useState<EdFilter>('all');
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
        subtitle={<>ปริมาณการใช้ยา ราคาทุน / ราคาขาย และผู้ป่วยที่รับยา ระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={<FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />}
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? <PageSkeleton cards={5} rows={[1, 1, 2]} /> : (() => {
        const period = `${formatDmy(data.start)} – ${formatDmy(data.end)}`;
        const years = compare?.years.map(y => y.fiscalYear).reverse().join(', ');
        // ตัวกรองบัญชียาหลัก — กรองตาราง และคิดยอดในการ์ดใหม่จากรายการที่เหลือ
        const pass = (item: { ed: boolean }) => edFilter === 'all' || item.ed === (edFilter === 'ed');
        const lists = {
          modern: data.topDrugs.modern.filter(pass),
          thai: data.topDrugs.thai.filter(pass),
          inhouse: data.topDrugs.inhouse.filter(pass),
        };
        const total = (items: { qty: number; value: number; cost?: number }[]) => ({
          qty: items.reduce((s, i) => s + i.qty, 0),
          value: items.reduce((s, i) => s + i.value, 0),
          cost: items.reduce((s, i) => s + (i.cost ?? 0), 0),
        });
        const byType = { modern: total(lists.modern), thai: total(lists.thai), inhouse: total(lists.inhouse) };
        const all = total([...lists.modern, ...lists.thai, ...lists.inhouse]);
        const edLabel = edFilter === 'all' ? '' : edFilter === 'ed' ? ' · ในบัญชียาหลัก' : ' · นอกบัญชียาหลัก';
        // สัดส่วนในบัญชี: login = ตามมูลค่า · ผู้เยี่ยมชม = ตามจำนวนชิ้น
        const edShare = data.showMoney
          ? (data.totals.value ? (data.totals.ed.value / data.totals.value) * 100 : 0)
          : (data.totals.qty ? (data.totals.ed.qty / data.totals.qty) * 100 : 0);
        const margin = all.value - all.cost;
        const p = data.patients as typeof data.patients | undefined;
        const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : '0%');
        return (
          <>
            <div className="drug-ed-bar">
              <span className="drug-ed-label"><i className="fa-solid fa-book-medical" /> บัญชียาหลักแห่งชาติ</span>
              <div className="segmented">
                {ED_FILTERS.map(f => (
                  <button key={f.value} className={edFilter === f.value ? 'active' : ''} onClick={() => setEdFilter(f.value)}>{f.label}</button>
                ))}
              </div>
              <div className="drug-ed-split" title={`สัดส่วน${data.showMoney ? 'มูลค่า' : 'จำนวนชิ้น'}การใช้ยา ในบัญชี / นอกบัญชียาหลัก (ช่วงวันที่ที่เลือก)`}>
                <span className="drug-ed-track"><span style={{ width: `${edShare}%` }} /></span>
                <small>
                  ในบัญชี <b>{edShare.toFixed(1)}%</b> ({data.totals.ed.items} รายการ) · นอกบัญชี <b>{(100 - edShare).toFixed(1)}%</b> ({data.totals.ned.items} รายการ)
                </small>
              </div>
            </div>

            {/* ผู้ป่วยที่รับยา / ไม่มียา — ข้อมูลรุ่นเก่า (ที่พักผลก่อนอัปเดต) ไม่มีส่วนนี้ ข้ามไปไม่ให้หน้าพัง */}
            {p && <>
            <section className="grid-3">
              <KpiCard accent="indigo" icon="fa-prescription-bottle-medical" title="ผู้ป่วยนอกที่รับยา" value={formatNumber(p.opd.withDrug)} unit="ครั้ง"
                badgeIcon="fa-user" badge={`${formatNumber(p.opd.personsWithDrug)} คน`} note={`${pct(p.opd.withDrug, p.opd.visits)} ของผู้ป่วยนอก ${formatNumber(p.opd.visits)} ครั้ง`} />
              <KpiCard accent="slate" icon="fa-ban" title="ผู้ป่วยนอกที่ไม่มียา" value={formatNumber(p.opd.noDrug)} unit="ครั้ง"
                badgeIcon="fa-user" badge={`${formatNumber(p.opd.personsNoDrug)} คน`} note={`${pct(p.opd.noDrug, p.opd.visits)} — เช่น ทำแผล ตรวจตามนัด ทำหัตถการ`} />
              <KpiCard accent="plum" icon="fa-bed-pulse" title="ผู้ป่วยในที่รับยา" value={formatNumber(p.ipd.withDrug)} unit="ราย"
                badgeIcon="fa-hospital" badge={`จาก admit ${formatNumber(p.ipd.admits)} ราย`} note={pct(p.ipd.withDrug, p.ipd.admits)} />
            </section>
            <p className="panel-foot-note drug-patient-note">นับตามครั้งที่มารับบริการ (visit) · ผู้ป่วยคนเดียวที่มาหลายครั้ง อาจมีทั้งครั้งที่รับยาและไม่มียา จึงนับอยู่ทั้งสองกลุ่ม</p>
            </>}

            {data.showMoney ? (
              <>
                <section className="grid-4">
                  <KpiCard accent="indigo" icon="fa-boxes-stacked" title={`ปริมาณการใช้ยารวม${edLabel}`} value={formatNumber(all.qty)} unit="ชิ้น" badgeIcon="fa-calendar-days" badge={period} />
                  <KpiCard accent="slate" icon="fa-tags" title={`ราคาทุนรวม${edLabel}`} value={money.format(all.cost)} unit="บาท" badgeIcon="fa-calendar-days" badge={period} />
                  <KpiCard accent="plum" icon="fa-coins" title={`ราคาขายรวม${edLabel}`} value={money.format(all.value)} unit="บาท" badgeIcon="fa-calendar-days" badge={period} />
                  <KpiCard accent={margin < 0 ? 'rose' : 'amber'} icon="fa-scale-balanced" title="ส่วนต่าง (ขาย − ทุน)" value={money.format(margin)} unit="บาท"
                    badgeIcon="fa-percent" badge={`${all.value ? ((margin / all.value) * 100).toFixed(1) : '0.0'}% ของราคาขาย`} />
                </section>
              </>
            ) : (
              <>
                <section className="grid-4">
                  <KpiCard accent="indigo" icon="fa-boxes-stacked" title={`ปริมาณการใช้ยารวม${edLabel}`} value={formatNumber(all.qty)} unit="ชิ้น" badgeIcon="fa-calendar-days" badge={period} />
                  <KpiCard accent="plum" icon="fa-seedling" title="ยาสมุนไพร" value={formatNumber(byType.thai.qty)} unit="ชิ้น" badgeIcon="fa-list" badge={`${lists.thai.length} รายการ`} />
                  <KpiCard accent="indigo" icon="fa-capsules" title="ยาสามัญ" value={formatNumber(byType.modern.qty)} unit="ชิ้น" badgeIcon="fa-list" badge={`${lists.modern.length} รายการ`} />
                  <KpiCard accent="amber" icon="fa-flask" title="ยาผลิตใช้เอง" value={formatNumber(byType.inhouse.qty)} unit="ชิ้น" badgeIcon="fa-list" badge={`${lists.inhouse.length} รายการ`} />
                </section>
                <div className="notice-bar drug-money-note"><i className="fa-solid fa-lock" /><span>ราคาทุน / ราคาขาย แสดงเฉพาะผู้ที่เข้าสู่ระบบ</span></div>
              </>
            )}

            {/* กราฟ: แนวโน้มรายเดือน + ทุน/ขายแยกกลุ่มยา */}
            {/* ข้อมูลรุ่นเก่า (ที่พักผลก่อนอัปเดต) ไม่มีรายเดือน — ข้ามไม่ให้หน้าพัง */}
            {(data.monthly as typeof data.monthly | undefined) && (
            <section className="report-row cols-2">
              <Panel title="ผู้ป่วยนอกที่รับยา / ไม่มียา รายเดือน" subtitle={`จำนวนครั้ง (แท่ง) และ % ที่รับยา (เส้น) · ปีงบประมาณ ${data.monthly.fiscalYear}`} printable>
                <ReportChart
                  labels={data.monthly.labels}
                  stacked
                  height={300}
                  printCategory="เดือน"
                  rightAxis={{ suffix: '%', min: 0, max: 100 }}
                  series={[
                    { label: 'รับยา (ครั้ง)', data: data.monthly.withDrug, color: '#4f46e5' },
                    { label: 'ไม่มียา (ครั้ง)', data: data.monthly.noDrug, color: '#cbd5e1' },
                    { label: '% รับยา', type: 'line', axis: 'right', color: '#e11d48', data: data.monthly.withDrug.map((w, i) => {
                      const all = w + data.monthly.noDrug[i];
                      return all ? Math.round((w / all) * 1000) / 10 : null;
                    }) },
                  ]}
                />
              </Panel>
              {data.showMoney ? (
                <Panel title="ราคาทุน / ราคาขาย รายเดือน" subtitle={`บาท (แท่ง) และ % ส่วนต่างของราคาขาย (เส้น) · ปีงบประมาณ ${data.monthly.fiscalYear}`} printable>
                  <ReportChart
                    labels={data.monthly.labels}
                    height={300}
                    printCategory="เดือน"
                    rightAxis={{ suffix: '%', min: 0, max: 60 }}
                    series={[
                      { label: 'ราคาทุน', data: data.monthly.cost, color: '#94a3b8' },
                      { label: 'ราคาขาย', data: data.monthly.sale, color: '#8b5cf6' },
                      { label: '% ส่วนต่าง', type: 'line', axis: 'right', color: '#d97706', data: data.monthly.sale.map((v, i) => (v ? Math.round(((v - data.monthly.cost[i]) / v) * 1000) / 10 : null)) },
                    ]}
                  />
                </Panel>
              ) : (
                <Panel title="ปริมาณการใช้ยาแยกกลุ่ม" subtitle={`จำนวนชิ้น · ${period}`} printable>
                  <ReportChart
                    labels={['ยาสามัญ', 'ยาสมุนไพร', 'ยาผลิตใช้เอง']}
                    horizontal
                    showValues
                    showLegend={false}
                    height={300}
                    printCategory="กลุ่มยา"
                    series={[{ label: 'จำนวนชิ้น', data: [byType.modern.qty, byType.thai.qty, byType.inhouse.qty], color: '#4f46e5' }]}
                  />
                </Panel>
              )}
            </section>
            )}
            {data.showMoney && (
              <Panel title={`ราคาทุน / ราคาขาย แยกกลุ่มยา${edLabel}`} subtitle={`บาท · ${period}`} printable className="mb-row">
                <ReportChart
                  labels={[`ยาสามัญ (${lists.modern.length} รายการ)`, `ยาสมุนไพร (${lists.thai.length} รายการ)`, `ยาผลิตใช้เอง (${lists.inhouse.length} รายการ)`]}
                  horizontal
                  height={220}
                  printCategory="กลุ่มยา"
                  series={[
                    { label: 'ราคาทุน', data: [byType.modern.cost, byType.thai.cost, byType.inhouse.cost].map(v => Math.round(v)), color: '#94a3b8' },
                    { label: 'ราคาขาย', data: [byType.modern.value, byType.thai.value, byType.inhouse.value].map(v => Math.round(v)), color: '#8b5cf6' },
                  ]}
                />
                <p className="panel-foot-note">
                  ยาสมุนไพร: ทุน {money.format(byType.thai.cost)} · ขาย {money.format(byType.thai.value)} บาท ·
                  ยาผลิตใช้เอง: ทุน {money.format(byType.inhouse.cost)} · ขาย {money.format(byType.inhouse.value)} บาท
                  (แท่งสั้นเพราะยาสามัญมีมูลค่ามากกว่าหลายสิบเท่า — ชี้ที่แท่งเพื่อดูตัวเลข)
                </p>
              </Panel>
            )}

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
                <DrugCompareView compare={compare} showMoney={data.showMoney} />
              ) : (
                <div className="compare-empty">
                  <i className="fa-solid fa-hand-pointer" />
                  <strong>กรุณาเลือกหรือพิมพ์ค้นหารายการยาในช่องด้านบน</strong>
                  <small>ระบบจะดึงข้อมูลปริมาณการใช้และมูลค่ารวมย้อนหลัง 3 ปีงบประมาณมาเปรียบเทียบให้อัตโนมัติ</small>
                </div>
              )}
            </Panel>

            <Panel title={`อันดับการใช้ยาสามัญ${edLabel}`} subtitle={`ช่วงวันที่: ${period} · ${lists.modern.length} รายการ`} printable className="mb-row">
              <DrugTable items={lists.modern} nameLabel="ชื่อยาสามัญ" searchPlaceholder="ค้นหายาสามัญ..." accent={MODERN_COLOR} showMoney={data.showMoney} />
            </Panel>

            <section className="report-row cols-2">
              <Panel title={`อันดับการใช้ยาสมุนไพร${edLabel}`} subtitle={`ช่วงวันที่: ${period} · ${lists.thai.length} รายการ`} printable>
                <DrugTable items={lists.thai} nameLabel="ชื่อยาสมุนไพร" searchPlaceholder="ค้นหายาสมุนไพร..." accent={THAI_COLOR} showMoney={data.showMoney} />
              </Panel>
              <Panel title={`อันดับการใช้ยาผลิตใช้เอง${edLabel}`} subtitle={`ช่วงวันที่: ${period} · ${lists.inhouse.length} รายการ`} printable>
                <DrugTable items={lists.inhouse} nameLabel="ชื่อยาผลิตใช้เอง" searchPlaceholder="ค้นหายาผลิตใช้เอง..." accent={INHOUSE_COLOR} showMoney={data.showMoney} />
              </Panel>
            </section>
          </>
        );
      })()}
    </>
  );
}
