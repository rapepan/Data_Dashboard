import FilterBar from '../components/FilterBar';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import StatCard from '../components/StatCard';
import Panel from '../components/report/Panel';
import DonutPanel from '../components/report/DonutPanel';
import HBarList from '../components/report/HBarList';
import RankTable from '../components/report/RankTable';
import ReportChart from '../charts/ReportChart';
import { useReport } from '../hooks/useReport';
import { fetchPostalDrugReport } from '../services/reportService';
import { formatDmy, formatNumber } from '../utils/format';

const COLORS = ['#4f46e5', '#8b5cf6', '#0ea5e9', '#f59e0b', '#e11d48', '#94a3b8'];

const withUnit = (value: number | string, unit: string) => <>{typeof value === 'number' ? formatNumber(value) : value} <small className="stat-unit">{unit}</small></>;
const hasData = (items: { value: number }[]) => items.some(i => i.value > 0);
const Empty = () => <p className="empty-note"><i className="fa-solid fa-inbox" /> ยังไม่มีข้อมูลในปีงบประมาณนี้</p>;

/** การส่งยาทางไปรษณีย์ (ส่งยาถึงบ้านผู้ป่วย) */
export default function PostalDrugPage() {
  const { filter, applyFilter, data, error, refresh } = useReport(fetchPostalDrugReport);

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="การส่งยาทางไปรษณีย์"
        subtitle={<>สถิติการจัดส่งยาถึงบ้านผู้ป่วย ระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={<FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />}
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? <PageSkeleton cards={4} rows={[1, 2, 2]} /> : (() => {
        const fy = `ปีงบประมาณ ${data.fiscalYear}`;
        return (
          <>
            <section className="grid-4">
              <StatCard
                accent="indigo" icon="fa-truck-fast" tooltip="จำนวนครั้งที่ส่งยาทางไปรษณีย์ในช่วงวันที่ที่เลือก"
                title="ส่งยาในช่วงที่เลือก" value={withUnit(data.range.total, 'ครั้ง')}
                parts={[
                  { label: 'ผู้ป่วย', value: data.range.patients, display: `${formatNumber(data.range.patients)} คน`, tone: 'sky' },
                  { label: 'รายการยา', value: data.range.items, display: `${formatNumber(data.range.items)} รายการ`, tone: 'plum' },
                ]}
                foot={`${formatDmy(filter.start)} – ${formatDmy(filter.end)}`}
              />
              <StatCard
                accent="plum" icon="fa-calendar-week" tooltip="จำนวนครั้งในเดือนของวันสิ้นสุด นับถึงวันนั้น"
                title="ส่งยาเดือนนี้" value={withUnit(data.month.total, 'ครั้ง')}
                parts={[{ label: 'สะสม', value: data.month.total, tone: 'sky' }]}
                foot={`${formatDmy(data.month.start)} – ${formatDmy(filter.end)}`}
              />
              <StatCard
                accent="rose" icon="fa-calendar-days" tooltip="จำนวนครั้งสะสมในปีงบประมาณ นับถึงวันสิ้นสุด"
                title={`ส่งยา${fy}`} value={withUnit(data.fiscal.total, 'ครั้ง')}
                parts={[{ label: 'สะสมรวม', value: data.fiscal.total, tone: 'amber' }]}
                foot="ปีงบประมาณสะสมปัจจุบัน (1 ต.ค. – 30 ก.ย.)"
              />
              <StatCard
                accent="amber" icon="fa-box" tooltip="จำนวนรายการยาเฉลี่ยในพัสดุแต่ละครั้ง"
                title="รายการยาเฉลี่ยต่อครั้ง" value={withUnit(data.itemsPerDelivery.toFixed(1), 'รายการ')}
                parts={[{ label: 'รวมในช่วงที่เลือก', value: data.range.items, tone: 'indigo' }]}
                foot="ค่าเฉลี่ยจากทุกครั้งที่จัดส่ง"
              />
            </section>

            <Panel title="จำนวนการส่งยาทางไปรษณีย์ รายเดือน" subtitle={`จำนวนครั้ง (${fy}: 1 ต.ค. – 30 ก.ย.)`} printable>
              <ReportChart
                labels={data.monthly.labels}
                series={[{ label: 'จำนวนครั้ง', data: data.monthly.values, color: '#4f46e5' }]}
                showLegend={false}
                showValues
                height={280}
                printCategory="เดือน"
              />
            </Panel>

            <section className="report-row cols-2">
              <Panel title="บริษัทขนส่ง" subtitle={fy} printable>
                {hasData(data.companies) ? <DonutPanel items={data.companies} colors={COLORS} size={200} valueLabel="จำนวนครั้ง" printCategory="บริษัทขนส่ง" /> : <Empty />}
              </Panel>
              <Panel title="สิทธิการรักษา" subtitle={fy} printable>
                {hasData(data.rights) ? <DonutPanel items={data.rights} colors={COLORS} size={200} valueLabel="จำนวนครั้ง" printCategory="สิทธิการรักษา" /> : <Empty />}
              </Panel>
            </section>

            <section className="report-row cols-2">
              <Panel title="แผนกที่สั่งส่งยา" subtitle={`จำนวนครั้ง · ${fy}`} printable>
                {hasData(data.departments) ? <HBarList items={data.departments} labelWidth={220} showShare /> : <Empty />}
              </Panel>
              <Panel title="พื้นที่จัดส่ง (อำเภอ)" subtitle={`จำนวนครั้ง · ${fy}`} printable>
                {hasData(data.districts) ? <HBarList items={data.districts} labelWidth={220} showShare /> : <Empty />}
              </Panel>
            </section>

            <Panel title="อันดับโรคของผู้ป่วยที่ส่งยาทางไปรษณีย์" subtitle={`การวินิจฉัยหลัก (ICD-10) · ${fy}`} printable>
              {data.topDiseases.length ? <RankTable items={data.topDiseases} codeLabel="รหัส ICD-10" nameLabel="ชื่อโรค" /> : <Empty />}
            </Panel>
          </>
        );
      })()}
    </>
  );
}
