import { useState, type CSSProperties } from 'react';
import HourlyChart, { SERIES_META } from '../charts/HourlyChart';
import PaymentDonutChart from '../charts/PaymentDonutChart';
import FilterBar from '../components/FilterBar';
import InfoCard from '../components/InfoCard';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import RevenueByRightModal from '../components/RevenueByRightModal';
import StatCard from '../components/StatCard';
import ExportPair from '../components/report/ExportPair';
import TopDiseaseTable from '../components/TopDiseaseTable';
import { useDashboardData } from '../hooks/useDashboardData';
import { useAuth } from '../auth/AuthContext';
import { useLoginRedirect } from '../auth/useLoginRedirect';
import { fiscalYear, formatCompact, formatDmy, formatNumber, parseIsoDate, toIsoDate } from '../utils/format';

export default function DashboardPage() {
  const { filter, applyFilter, series, toggleSeries, data, error, refresh } = useDashboardData();
  const [revenueOpen, setRevenueOpen] = useState(false);
  const { session } = useAuth();
  const goLogin = useLoginRedirect();
  const today = formatDmy(toIsoDate(new Date()));
  const fiscalLabel = `ปีงบประมาณ ${fiscalYear(parseIsoDate(filter.start))}`;
  const periodLabel = `วันที่ ${formatDmy(filter.start)} ถึง ${formatDmy(filter.end)}`;

  return (
    <>
      <PageHeader
        meta={data?.meta}
        title="ภาพรวมระบบสถิติโรงพยาบาล"
        subtitle={<>แสดงผลสถิติจำนวนผู้รับบริการ งานนัดหมาย และคิวให้บริการ ระหว่างวันที่ <b>{formatDmy(filter.start)}</b> ถึง <b>{formatDmy(filter.end)}</b></>}
        actions={<FilterBar filter={filter} onApply={applyFilter} onRefresh={refresh} />}
      />
      {error && <div className="notice-bar error"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

      {!data ? (
        !error && <PageSkeleton cards={4} rows={[5, 2]} />
      ) : (
        <>
          <section className="grid-4">
            <StatCard
              accent="indigo" icon="fa-hospital-user" tooltip="จำนวนผู้ป่วยนอกที่เข้ารับบริการวันนี้"
              title={`ผู้ป่วยนอก (OPD) ประจำวันที่ ${today}`} value={formatNumber(data.opd.total)} changePct={data.opd.changePct}
              parts={[
                { label: 'Walk-in', value: data.opd.walkin, tone: 'indigo' },
                { label: 'นัดหมาย', value: data.opd.appointment, tone: 'plum' },
              ]}
              foot={<>เมื่อวาน {formatNumber(data.opd.yesterday)} ราย</>}
            />

            <StatCard
              accent="plum" icon="fa-calendar-check" tooltip="จำนวนผู้ป่วยที่มีนัดหมายวันนี้"
              title={`ผู้ป่วยนัดหมายประจำวันที่ ${today}`} value={formatNumber(data.appointment.total)} changePct={data.appointment.changePct}
              parts={[
                { label: 'มาตามนัด', value: data.appointment.came, tone: 'indigo', showPct: true },
                { label: 'ไม่มาตามนัด', value: data.appointment.missed, tone: 'rose', showPct: true },
              ]}
              foot={<>สัปดาห์ (วันเดียวกัน) ที่แล้ว {formatNumber(data.appointment.lastWeek)} ราย</>}
            />

            <StatCard
              accent="rose" icon="fa-truck-medical" tooltip="จำนวนผู้ป่วยห้องฉุกเฉินวันนี้ แยกตามระดับความรุนแรง (Triage)"
              title={`ห้องฉุกเฉิน (ER) ประจำวันที่ ${today}`} value={formatNumber(data.er.total)} changePct={data.er.changePct}
              parts={[
                { label: 'แดง', value: data.er.red, tone: 'rose' },
                { label: 'ชมพู', value: data.er.pink, tone: 'pink' },
                { label: 'เหลือง', value: data.er.yellow, tone: 'amber' },
                { label: 'เขียว', value: data.er.green, tone: 'sky' },
                { label: 'ขาว', value: data.er.white, tone: 'slate' },
              ]}
              foot={<>เมื่อวาน {formatNumber(data.er.yesterday)} ราย</>}
            />

            <StatCard
              accent="amber" icon="fa-bed-pulse" tooltip="จำนวนผู้ป่วยในที่นอนโรงพยาบาลวันนี้"
              title={`ผู้ป่วยใน (IPD) ประจำวันที่ ${today}`} value={formatNumber(data.ipd.total)} changePct={data.ipd.changePct}
              parts={[
                { label: 'Admit', value: data.ipd.admit, tone: 'indigo' },
                { label: 'จำหน่าย', value: data.ipd.discharge, tone: 'orange' },
              ]}
              foot={<>เมื่อวาน {formatNumber(data.ipd.yesterday)} ราย</>}
            />
          </section>

          <section className="grid-5">
            <InfoCard accent="indigo" icon="fa-right-left" title="ผู้ป่วยส่งต่อวันนี้" tooltip="จำนวนผู้ป่วย Refer เข้า/ออก วันนี้">
              <div className="refer-split">
                <div><small className="in"><i className="fa-solid fa-arrow-down" />In</small><b>{data.referral.in}</b></div>
                <div><small className="out"><i className="fa-solid fa-arrow-up" />Out</small><b>{data.referral.out}</b></div>
              </div>
            </InfoCard>
            <InfoCard accent="plum" icon="fa-receipt" title="ค่ารักษาพยาบาล OPD วันนี้" tooltip="ค่ารักษาพยาบาลผู้ป่วยนอกรวมวันนี้">
              <div className="info-value">{formatCompact(data.revenueOpd)} <small>บาท</small></div>
              {session?.canViewRevenueDetail ? (
                <button className="detail-pill" onClick={() => setRevenueOpen(true)}><i className="fa-solid fa-table" />ดูรายละเอียด</button>
              ) : (
                <button className="detail-pill locked" onClick={goLogin} data-tip="เข้าสู่ระบบเพื่อดูรายละเอียดแยกตามสิทธิ์">
                  <i className="fa-solid fa-lock" />เข้าสู่ระบบเพื่อดูรายละเอียด
                </button>
              )}
            </InfoCard>
            <InfoCard accent="slate" icon="fa-bed" title="เตียงว่างวันนี้" tooltip="จำนวนเตียงว่างในระบบ">
              <div className="info-value">{data.bed.free}</div>
              <div className="info-sub">เตียงในระบบ {data.bed.total} เตียง</div>
            </InfoCard>
            <InfoCard accent="amber" icon="fa-gauge-high" title="ครองเตียงเดือนนี้" tooltip="อัตราครองเตียง = วันนอน / (จำนวนวัน × เตียงตามกรอบ)">
              <div className="info-value">{data.bed.occupancyPct.toFixed(1)}%</div>
              <div className="info-sub">{formatNumber(data.bed.patientDays)} วันนอน / {data.bed.days} วัน / {data.bed.total} เตียงตามกรอบ</div>
            </InfoCard>
            <InfoCard accent="rose" icon="fa-notes-medical" title="AdjRW เดือนนี้" tooltip="ค่าน้ำหนักสัมพัทธ์ที่ปรับแล้วเฉลี่ยเดือนนี้">
              <div className="info-value">{data.adjrw}</div>
            </InfoCard>
          </section>

          <section className="chart-grid">
            <article className="card-box chart-card">
              <div className="chart-card-head">
                <strong><i className="fa-solid fa-chart-line" /> สถิติจำนวนผู้เข้ารับบริการรายชั่วโมงวันนี้</strong>
                <ExportPair title="สถิติจำนวนผู้เข้ารับบริการรายชั่วโมงวันนี้" />
                <div className="series-toggle">
                  {SERIES_META.map(meta => (
                    <button
                      key={meta.key}
                      className={series[meta.key] ? 'on' : ''}
                      style={{ '--series': meta.color } as CSSProperties}
                      onClick={() => toggleSeries(meta.key)}
                    >{meta.short}</button>
                  ))}
                </div>
              </div>
              <HourlyChart hourly={data.hourly} series={series} />
            </article>

            <article className="card-box chart-card">
              <div className="chart-card-head">
                <strong><i className="fa-solid fa-chart-pie" /> สัดส่วนผู้ป่วยรับบริการแยกตามสิทธิ์การรักษา</strong>
                <ExportPair title="สัดส่วนผู้ป่วยรับบริการแยกตามสิทธิ์การรักษา" />
              </div>
              <PaymentDonutChart items={data.paymentMix} />
            </article>
          </section>

          <section className="grid-2">
            <TopDiseaseTable kind="opd" icon="fa-hospital-user" title="อันดับโรคผู้ป่วยนอก (OPD)" fiscalLabel={fiscalLabel} periodLabel={periodLabel} start={filter.start} end={filter.end} items={data.topDiseases.opd} />
            <TopDiseaseTable kind="ipd" icon="fa-bed-pulse" title="อันดับโรคผู้ป่วยใน (IPD)" fiscalLabel={fiscalLabel} periodLabel={periodLabel} start={filter.start} end={filter.end} items={data.topDiseases.ipd} />
          </section>

          <RevenueByRightModal open={revenueOpen} onClose={() => setRevenueOpen(false)} items={data.revenueByRight} />
        </>
      )}
    </>
  );
}
