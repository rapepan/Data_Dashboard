import { useState, type CSSProperties } from 'react';
import TopLimitSelect from './TopLimitSelect';
import Panel from './Panel';
import ReportChart from '../../charts/ReportChart';
import { formatNumber } from '../../utils/format';

interface IcdTopSectionProps {
  items: { code: string; name: string; count: number }[];
  /** ยอดรวมทั้งหมด (ใช้คิด %) */
  total: number;
  chartTitle: string;
  tableTitle: string;
  /** ข้อความใต้หัวข้อ เช่น หอผู้ป่วย / จุดส่งต่อ ที่เลือก */
  subtitle: string;
  color: string;
  /** สีอ่อนสำหรับพื้นหลังรหัสโรค */
  softColor: string;
  emptyText: string;
}

/** กราฟแท่ง + ตารางรายละเอียด Top N รหัสโรค (ใช้ในหน้า Re-admit / Refer) — หัวข้อที่มีคำว่า "Top 10" จะเปลี่ยนตามจำนวนที่เลือก */
export default function IcdTopSection({ items, total, chartTitle, tableTitle, subtitle, color, softColor, emptyText }: IcdTopSectionProps) {
  const [limit, setLimit] = useState(10);
  const top = items.slice(0, limit);
  const withLimit = (title: string) => title.replace('Top 10', `Top ${limit}`);
  const maxCount = Math.max(1, ...top.map(i => i.count));

  if (top.length === 0) {
    return <article className="card-box"><p className="empty-note"><i className="fa-solid fa-inbox" /> {emptyText}</p></article>;
  }

  return (
    <section className="report-row cols-1-2 icd-top" style={{ '--top-color': color, '--top-soft': softColor } as CSSProperties}>
      <Panel title={withLimit(chartTitle)} subtitle={subtitle} printable>
        <ReportChart
          labels={top.map(i => i.code)}
          series={[{ label: 'จำนวนครั้ง', data: top.map(i => i.count), color }]}
          showLegend={false}
          showValues
          height={320}
          printCategory="รหัสโรค (ICD-10)"
        />
      </Panel>

      <Panel title={withLimit(tableTitle)} subtitle={`${subtitle} · เรียงตามจำนวนครั้ง`} actions={<TopLimitSelect value={limit} onChange={setLimit} />} printable>
        <table className="report-table procedure-table icd-top-table">
          <thead>
            <tr><th className="center">ลำดับ</th><th>รหัส ICD-10</th><th>ชื่อโรค (Diagnostic Name)</th><th className="num">จำนวนครั้ง (สัดส่วน %)</th></tr>
          </thead>
          <tbody>
            {top.map((item, i) => (
              <tr key={item.code}>
                <td className="center rank-cell">{i + 1}</td>
                <td><code className="icd-top-code">{item.code}</code></td>
                <td>
                  <span className="procedure-name">{item.name}</span>
                  <span className="procedure-bar"><span style={{ width: `${(item.count / maxCount) * 100}%` }} /></span>
                </td>
                <td className="num" data-x={String(item.count)}><b>{formatNumber(item.count)}</b> <small className="muted">ครั้ง ({total ? ((item.count / total) * 100).toFixed(1) : '0.0'}%)</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}
