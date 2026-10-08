import FilterBar from '../components/FilterBar';
import KpiCard from '../components/KpiCard';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import Panel from '../components/report/Panel';
import CountSummaryCard from '../components/report/CountSummaryCard';
import ClinicOpdBlock from '../components/report/ClinicOpdBlock';
import DrugTable from '../components/report/DrugTable';
import ReportChart from '../charts/ReportChart';
import { useReport } from '../hooks/useReport';
import { fetchThaiMedicineReport } from '../services/reportService';
import { formatDmy, formatNumber } from '../utils/format';

/** นวด/ประคบสมุนไพร / อบสมุนไพร / ฟื้นฟูหลังคลอด / นวดเท้า-พอกเข่า */
const SERVICE_COLORS = ['#4f46e5', '#0ea5e9', '#e11d48', '#f59e0b'];
/** ยาสมุนไพร (ไม่ใช้สีเขียวตามธีมระบบ) — หน้านี้แสดงเฉพาะยาสมุนไพร ผู้ใช้ไม่ได้ใช้ข้อมูลยาปัจจุบัน (ยาสามัญ) */
const HERB_COLOR = '#8b5cf6';
const THAI_COLOR = '#4f46e5';
const CHINESE_COLOR = '#e11d48';
/** สิทธิการรักษา: UCS / ข้าราชการ / ประกันสังคม / ชำระเงินเอง / อื่น ๆ */
const RIGHT_COLORS = ['#4f46e5', '#8b5cf6', '#0ea5e9', '#f59e0b', '#94a3b8'];

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ThaiMedicinePage() {
  const { filter, applyFilter, data, error, refresh, compare } = useReport(fetchThaiMedicineReport, { compare: true });

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="แพทย์แผนไทย & แพทย์แผนจีน"
        subtitle={<>สถิติผู้รับบริการแพทย์แผนไทย แพทย์แผนจีน และการใช้ยาสมุนไพร ระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={<FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />}
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? <PageSkeleton cards={3} rows={[2, 2, 1]} /> : (() => {
        const period = `${formatDmy(data.start)} – ${formatDmy(data.end)}`;
        const fiscalLabel = `ปีงบประมาณ ${data.fiscalYear}`;
        const fy = `สะสมในปีงบประมาณ ${data.fiscalYear} (1 ต.ค. – 30 ก.ย.)`;
        const imc = data.chinese.imc;
        return (
          <>
            {/* ---------- แพทย์แผนไทย ---------- */}
            <h2 className="section-heading"><i className="fa-solid fa-leaf" /> แพทย์แผนไทย</h2>

            {/* บริการ: นวด/ประคบสมุนไพร, อบสมุนไพร, ฟื้นฟูหลังคลอด, นวดเท้า-พอกเข่า */}
            <section className="report-row cols-3">
              <CountSummaryCard colors={SERVICE_COLORS} accent="indigo" icon="fa-leaf" title="ผู้รับบริการแผนไทยรวม" note={period} data={data.range} categories={data.categories} change={compare(r => r.range.total.persons)} />
              <CountSummaryCard colors={SERVICE_COLORS} accent="plum" icon="fa-calendar-check" title="ผู้รับบริการเดือนนี้" note={`สถิติสะสมทั้งเดือน (${formatDmy(data.month.start)} – ${formatDmy(data.month.end)})`} data={data.month} categories={data.categories} />
              <CountSummaryCard colors={SERVICE_COLORS} accent="amber" icon="fa-clock-rotate-left" title="ผู้รับบริการวันนี้" note={`ประจำวันที่ ${formatDmy(data.day.date)}`} data={data.day} categories={data.categories} />
            </section>

            {/* ผู้ป่วยนอกโรคทางแพทย์แผนไทย: ต่อวัน / รายเดือน / รวม + 10 อันดับโรค */}
            <ClinicOpdBlock data={data.thaiOpd} clinic="แพทย์แผนไทย" color={THAI_COLOR} period={period} fiscalLabel={fiscalLabel} compare={pick => compare(r => pick(r.thaiOpd))} />

            <Panel
              title="จำนวนครั้งแยกตามสิทธิการรักษา แต่ละเดือน"
              subtitle={`จำนวนครั้งที่ให้บริการแพทย์แผนไทย ตามสิทธิการรักษาหลัก · ${fiscalLabel}`}
              printable
              className="mb-row"
            >
              <ReportChart
                labels={data.rightsMonthly.labels}
                stacked
                height={320}
                printCategory="เดือน"
                series={data.rightsMonthly.rights.map((right, i) => ({ label: right, data: data.rightsMonthly.values[i], color: RIGHT_COLORS[i % RIGHT_COLORS.length] }))}
              />
            </Panel>

            {/* ยาสมุนไพร */}
            <section className="report-row cols-1-2">
              <Panel title="การใช้ยาสมุนไพร" subtitle={fy} printable>
                <div className="drug-boxes herb-only">
                  <div style={{ ['--c' as string]: HERB_COLOR }}>
                    <span><i className="fa-solid fa-seedling" /> ปริมาณยาสมุนไพร</span>
                    <b>{formatNumber(data.drugs.herb.qty)} <small>ชิ้น</small></b>
                    <em>จ่ายยาสมุนไพรสะสมทั้งปีงบประมาณ</em>
                  </div>
                  <div style={{ ['--c' as string]: HERB_COLOR }}>
                    <span><i className="fa-solid fa-coins" /> มูลค่ายาสมุนไพร</span>
                    <b>{money.format(data.drugs.herb.value)} <small>บาท</small></b>
                    <em>เฉลี่ย {money.format(data.drugs.herb.qty ? data.drugs.herb.value / data.drugs.herb.qty : 0)} บาท/ชิ้น</em>
                  </div>
                </div>
              </Panel>
              <Panel title="แนวโน้มการใช้ยาสมุนไพร (รายเดือน)" subtitle={`จำนวนชิ้น · ${fy}`} printable>
                <ReportChart
                  labels={data.monthlyDrugs.labels}
                  height={330}
                  printCategory="เดือน"
                  showLegend={false}
                  series={[{ label: 'ยาสมุนไพร (ชิ้น)', data: data.monthlyDrugs.herb, color: HERB_COLOR }]}
                />
              </Panel>
            </section>

            <Panel title="อันดับปริมาณการจ่ายยาสมุนไพร" subtitle={`ช่วงวันที่: ${period}`} printable className="mb-row">
              <DrugTable items={data.topDrugs.herb} nameLabel="ชื่อสมุนไพร" searchPlaceholder="ค้นหายาสมุนไพร..." accent={HERB_COLOR} />
            </Panel>

            {/* ---------- แพทย์แผนจีน ---------- */}
            <h2 className="section-heading"><i className="fa-solid fa-yin-yang" /> แพทย์แผนจีน</h2>
            <ClinicOpdBlock
              data={data.chinese}
              clinic="แพทย์แผนจีน"
              color={CHINESE_COLOR}
              period={period}
              fiscalLabel={fiscalLabel}
              kind="ipd"
              compare={pick => compare(r => pick(r.chinese))}
              extraCard={
                <KpiCard
                  accent="rose"
                  icon="fa-brain"
                  title="ผู้ป่วย IMC (Intermediate Care)"
                  value={formatNumber(imc.range.persons)}
                  unit="คน"
                  badgeIcon="fa-calendar-week"
                  badge={period}
                  note={`เดือนนี้ ${formatNumber(imc.month.persons)} · วันนี้ ${formatNumber(imc.day.persons)} คน`}
                  change={compare(r => r.chinese.imc.range.persons)}
                />
              }
            />
          </>
        );
      })()}
    </>
  );
}
