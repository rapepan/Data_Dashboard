import type { RevenueByRightItem } from '../types/dashboard';
import { formatNumber } from '../utils/format';
import Modal from './Modal';
import ExportPair from './report/ExportPair';

interface RevenueByRightModalProps {
  open: boolean;
  onClose: () => void;
  items: RevenueByRightItem[];
}

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RevenueByRightModal({ open, onClose, items }: RevenueByRightModalProps) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const totalVisits = items.reduce((sum, item) => sum + item.visits, 0);
  const rows = [...items].sort((a, b) => b.amount - a.amount);
  const today = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="fa-receipt"
      title="ค่ารักษาพยาบาล OPD วันนี้ แยกตามสิทธิ์"
      subtitle={today}
      footerNote={<><i className="fa-solid fa-circle-info" /> ข้อมูล ณ วันนี้ เรียงตามรายรับสูงสุด</>}
    >
      <div className="modal-tools"><ExportPair title="ค่ารักษาพยาบาล OPD วันนี้ แยกตามสิทธิ์" /></div>
      <table className="modal-table">
        <thead>
          <tr>
            <th>สิทธิ์การรักษา</th>
            <th className="num">Visit</th>
            <th className="num">รายรับ<br />(บาท)</th>
            <th className="num">% รายรับ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const pct = total ? (row.amount / total) * 100 : 0;
            return (
              <tr key={row.right}>
                <td>{row.right}</td>
                <td className="num">{formatNumber(row.visits)}</td>
                <td className="num amount">{money.format(row.amount)}</td>
                <td className="num">
                  <span className="pct-cell">
                    <span className="pct-bar"><span style={{ width: `${pct}%` }} /></span>
                    <em>{pct.toFixed(1)}%</em>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>รวมทั้งหมด</td>
            <td className="num">{formatNumber(totalVisits)}</td>
            <td className="num amount">{money.format(total)}</td>
            <td className="num">100%</td>
          </tr>
        </tfoot>
      </table>
    </Modal>
  );
}
