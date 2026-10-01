import type { AppointmentDay } from '../../types/reports';

/**
 * นัดหมายรายคลินิกของ 1 วัน
 * showArrived = วันนี้/ย้อนหลัง (มีคอลัมน์ มาแล้ว / ยังไม่มา) · ไม่ระบุ = วันพรุ่งนี้ (จำนวนนัด + สัดส่วน)
 * past = วันที่ผ่านมาแล้ว — ผู้ที่ยังไม่มาคือ "ไม่มาตามนัด"
 */
export default function AppointmentClinicTable({ day, showArrived = false, past = false }: { day: AppointmentDay; showArrived?: boolean; past?: boolean }) {
  if (day.clinics.length === 0) {
    return <p className="appt-empty"><i className="fa-solid fa-calendar-xmark" /> ไม่มีนัดหมาย (วันหยุด)</p>;
  }
  const top = Math.max(...day.clinics.map(c => c.total));
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <table className="report-table appt-table">
      <thead>
        <tr>
          <th>คลินิก</th>
          <th className="num">นัด</th>
          {showArrived ? (<><th className="num">{past ? 'มา' : 'มาแล้ว'}</th><th className="num">{past ? 'ไม่มา' : 'ยังไม่มา'}</th><th className="appt-bar-col">มาตามนัด</th></>) : <th className="appt-bar-col">สัดส่วน</th>}
        </tr>
      </thead>
      <tbody>
        {day.clinics.map(c => (
          <tr key={c.clinic}>
            <td>{c.clinic}</td>
            <td className="num"><b>{c.total.toLocaleString('en-US')}</b></td>
            {showArrived ? (
              <>
                <td className="num">{c.arrived.toLocaleString('en-US')}</td>
                <td className={`num${c.total - c.arrived > 0 ? ' text-warning' : ''}`}>{(c.total - c.arrived).toLocaleString('en-US')}</td>
                <td className="appt-bar-col">
                  <span className="appt-bar"><span className="hbar-track"><span style={{ width: `${pct(c.arrived, c.total)}%`, background: 'var(--primary)' }} /></span><em>{pct(c.arrived, c.total)}%</em></span>
                </td>
              </>
            ) : (
              <td className="appt-bar-col">
                <span className="appt-bar"><span className="hbar-track"><span style={{ width: `${(c.total / top) * 100}%`, background: '#8b5cf6' }} /></span><em>{pct(c.total, day.total)}%</em></span>
              </td>
            )}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>รวม {day.clinics.length} คลินิก</td>
          <td className="num">{day.total.toLocaleString('en-US')}</td>
          {showArrived ? (
            <>
              <td className="num">{day.arrived.toLocaleString('en-US')}</td>
              <td className="num">{(day.total - day.arrived).toLocaleString('en-US')}</td>
              <td className="appt-bar-col"><em>{pct(day.arrived, day.total)}%</em></td>
            </>
          ) : <td className="appt-bar-col"><em>100%</em></td>}
        </tr>
      </tfoot>
    </table>
  );
}
