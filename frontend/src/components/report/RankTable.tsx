import { useMemo, useState } from 'react';
import type { RankedItem } from '../../types/reports';
import { formatNumber } from '../../utils/format';
import TopLimitSelect from './TopLimitSelect';

type SortKey = 'visits' | 'patients';

interface RankTableProps {
  items: RankedItem[];
  codeLabel: string;
  nameLabel: string;
  /** สีรหัส/อันดับ: opd = คราม, ipd = ม่วง */
  kind?: 'opd' | 'ipd';
}

/**
 * ตารางอันดับ (โรค / หัตถการ) — เลือก Top N ได้ และถ้ามีจำนวนคนจะสลับเรียงตามครั้ง/คนได้
 * ใช้คู่กับ Panel printable เพื่อพิมพ์ทั้งกล่อง
 */
export default function RankTable({ items, codeLabel, nameLabel, kind = 'opd' }: RankTableProps) {
  const hasPatients = items.some(item => item.patients !== undefined);
  const [sort, setSort] = useState<SortKey>('visits');
  const [limit, setLimit] = useState(10);

  const rows = useMemo(
    () => [...items].sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0) || b.visits - a.visits).slice(0, limit),
    [items, sort, limit],
  );

  return (
    <div className="rank-block" data-kind={kind}>
      <div className="rank-tools no-print">
        {hasPatients && (
          <div className="segmented">
            <button className={sort === 'visits' ? 'active' : ''} onClick={() => setSort('visits')}><i className="fa-solid fa-notes-medical" /> เรียงตามจำนวนครั้ง</button>
            <button className={sort === 'patients' ? 'active' : ''} onClick={() => setSort('patients')}><i className="fa-solid fa-users" /> เรียงตามจำนวนคน</button>
          </div>
        )}
        <TopLimitSelect value={limit} onChange={setLimit} />
      </div>
      {/* จอแคบ: เลื่อนตารางซ้าย-ขวาในกรอบ ไม่ดันทั้งหน้าให้กว้าง */}
      <div className="table-responsive">
      <table className="report-table rank-list">
        <thead>
          <tr>
            <th className="center">อันดับ</th>
            <th>{codeLabel}</th>
            <th>{nameLabel}</th>
            {hasPatients && <th className="num">จำนวนคน (คน)</th>}
            <th className="num">จำนวนครั้ง (ครั้ง)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={`${row.code}-${row.name}`}>
              <td className="center">{i + 1}</td>
              <td><code className="rank-code">{row.code}</code></td>
              <td>{row.name}</td>
              {hasPatients && <td className={`num${sort === 'patients' ? ' emphasis' : ''}`}>{formatNumber(row.patients ?? 0)}</td>}
              <td className={`num${sort === 'visits' ? ' emphasis' : ''}`}>{formatNumber(row.visits)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={hasPatients ? 5 : 4} className="empty">ไม่มีข้อมูลในช่วงนี้</td></tr>}
        </tbody>
      </table>
      </div>
    </div>
  );
}
