import { useMemo, useState } from 'react';
import type { DrugItem } from '../../types/reports';
import { formatNumber } from '../../utils/format';
import TopLimitSelect from './TopLimitSelect';

type SortKey = 'qty' | 'value';

interface DrugTableProps {
  /** ed = ในบัญชียาหลักแห่งชาติ — มีค่านี้แล้วแสดงคอลัมน์ บัญชียา */
  items: (DrugItem & { ed?: boolean })[];
  nameLabel: string;
  searchPlaceholder: string;
  /** สีตัวเลขจำนวนชิ้น */
  accent: string;
}

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ตารางอันดับยา — สลับเรียงตามจำนวนชิ้น / มูลค่า เลือก Top N และค้นหาชื่อหรือรหัสยาได้ */
export default function DrugTable({ items, nameLabel, searchPlaceholder, accent }: DrugTableProps) {
  const [sort, setSort] = useState<SortKey>('qty');
  const [limit, setLimit] = useState(10);
  const [query, setQuery] = useState('');
  const hasUnit = items.some(item => item.unit);
  const hasEd = items.some(item => item.ed !== undefined);
  const columns = 5 + (hasUnit ? 1 : 0) + (hasEd ? 1 : 0);

  const rows = useMemo(() => {
    // อันดับคิดจากทั้งหมดตามเกณฑ์ที่เลือก แล้วค่อยกรองคำค้น — อันดับไม่เปลี่ยนตามคำค้น
    const ranked = [...items].sort((a, b) => b[sort] - a[sort]).map((item, i) => ({ ...item, rank: i + 1 }));
    const q = query.trim().toLowerCase();
    return (q ? ranked.filter(d => d.name.toLowerCase().includes(q) || d.code.includes(q)) : ranked).slice(0, limit);
  }, [items, sort, query, limit]);

  return (
    <div className="rank-block" style={{ ['--kind' as string]: accent }}>
      <div className="rank-tools no-print">
        <div className="segmented">
          <button className={sort === 'qty' ? 'active' : ''} onClick={() => setSort('qty')}>จำนวนชิ้น (Qty)</button>
          <button className={sort === 'value' ? 'active' : ''} onClick={() => setSort('value')}>มูลค่ารวม (บาท)</button>
        </div>
        <label className="table-search"><i className="fa-solid fa-magnifying-glass" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder} /></label>
        <TopLimitSelect value={limit} onChange={setLimit} />
      </div>
      <table className="report-table rank-list">
        <thead>
          <tr><th className="center">อันดับ</th><th>รหัสยา</th><th>{nameLabel}</th>{hasEd && <th className="center">บัญชียา</th>}{hasUnit && <th className="center">หน่วยนับ</th>}<th className="num">จำนวน (ชิ้น)</th><th className="num">มูลค่ารวม (บาท)</th></tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.code}>
              <td className="center"><span className={`rank rank-${Math.min(row.rank, 4)}`}>{row.rank}</span></td>
              <td><code className="rank-code">{row.code}</code></td>
              <td>{row.name}</td>
              {hasEd && <td className="center"><span className={`ed-badge${row.ed ? '' : ' ned'}`} data-x={row.ed ? 'ในบัญชี' : 'นอกบัญชี'}>{row.ed ? 'ในบัญชี' : 'นอกบัญชี'}</span></td>}
              {hasUnit && <td className="center muted">{row.unit}</td>}
              <td className={`num${sort === 'qty' ? ' emphasis' : ''}`}>{formatNumber(row.qty)}</td>
              <td className={`num${sort === 'value' ? ' emphasis' : ''}`}>{money.format(row.value)} ฿</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={columns} className="empty">ไม่พบรายการยาที่ค้นหา</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
