import { useMemo, useRef, useState } from 'react';
import type { Icd10Item } from '../types/icd10';
import TopLimitSelect from './report/TopLimitSelect';
import { exportToExcel } from '../utils/exportExcel';
import ExportButton from './ExportButton';
import { formatNumber } from '../utils/format';
import { printElement } from '../utils/print';

type SortKey = 'visits' | 'patients';
type RankedItem = Icd10Item & { rank: number };

interface Icd10TableProps {
  items: Icd10Item[];
  start: string;
  end: string;
  periodLabel: string;
}


const SORTS: { key: SortKey; label: string; icon: string }[] = [
  { key: 'visits', label: 'เรียงตามจำนวนครั้ง', icon: 'fa-notes-medical' },
  { key: 'patients', label: 'เรียงตามจำนวนคน', icon: 'fa-users' },
];

function exportIcd10(filename: string, rows: RankedItem[]) {
  return exportToExcel<RankedItem>({
    filename,
    rows,
    columns: [
      { header: 'อันดับ', value: row => row.rank, width: 9, align: 'center' },
      { header: 'รหัสโรค (ICD-10)', value: row => row.code, width: 16, mono: true },
      { header: 'ชื่อโรค (ภาษาไทย)', value: row => row.nameTh ?? '', width: 46 },
      { header: 'ชื่อโรคการวินิจฉัย (ICD10 Name)', value: row => row.name, width: 60 },
      { header: 'จำนวนคน (คน)', value: row => row.patients, width: 15, align: 'right', bold: true, numFmt: '#,##0' },
      { header: 'จำนวนครั้ง (ครั้ง)', value: row => row.visits, width: 16, align: 'right', bold: true, numFmt: '#,##0' },
    ],
  });
}

export default function Icd10Table({ items, start, end, periodLabel }: Icd10TableProps) {
  const ref = useRef<HTMLElement>(null);
  const filename = `อันดับโรค_ICD10_${start}_ถึง_${end}`;
  const [sort, setSort] = useState<SortKey>('visits');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(10);

  const rows = useMemo(() => {
    // อันดับคิดจากทั้งหมดตามเกณฑ์ที่เลือก แล้วค่อยกรองคำค้น — อันดับจึงไม่เปลี่ยนตามคำค้น
    const ranked = [...items]
      .sort((a, b) => b[sort] - a[sort] || b.visits - a.visits)
      .map((item, i) => ({ ...item, rank: i + 1 }));
    const q = query.trim().toLowerCase();
    const filtered = q ? ranked.filter(item => item.code.toLowerCase().includes(q) || item.name.toLowerCase().includes(q) || Boolean(item.nameTh?.includes(q))) : ranked;
    return filtered.slice(0, limit);
  }, [items, sort, query, limit]);

  // ความหนาแน่นเทียบกับอันดับ 1 ของเกณฑ์ที่เลือก
  const maxValue = useMemo(() => Math.max(1, ...items.map(item => item[sort])), [items, sort]);

  return (
    <article ref={ref} className="card-box table-card icd-table" data-kind="opd">
      <div className="table-card-head">
        <div>
          <strong><i className="fa-solid fa-list-ol" /> ตารางอันดับโรค ({limit} อันดับแรก)</strong>
          <small>ค้นหารหัสโรค (ICD-10) สลับการเรียงลำดับ หรือขยายขอบเขตการแสดงผลได้ · {periodLabel}</small>
        </div>
        <div className="table-tools no-print">
          <div className="segmented">
            {SORTS.map(s => (
              <button key={s.key} className={sort === s.key ? 'active' : ''} onClick={() => setSort(s.key)}>
                <i className={`fa-solid ${s.icon}`} /> {s.label}
              </button>
            ))}
          </div>
          <label className="table-search"><i className="fa-solid fa-magnifying-glass" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหารหัสโรค / ชื่อ..." /></label>
          <TopLimitSelect value={limit} onChange={setLimit} />
          <ExportButton kind="pdf" detail="ตารางอันดับโรค ICD-10" onRun={() => { if (ref.current) printElement(ref.current, 'ตารางอันดับโรค ICD-10'); }} />
          <ExportButton kind="excel" detail={`${filename}.xlsx (${rows.length} แถว)`} onRun={() => exportIcd10(filename, rows)} />
        </div>
      </div>
      <div className="table-responsive">
        <table className="rank-table">
          <thead>
            <tr>
              <th>อันดับ</th>
              <th>รหัสโรค (ICD-10)</th>
              <th>ชื่อโรคการวินิจฉัย</th>
              <th className="num">จำนวนคน (คน)</th>
              <th className="num">จำนวนครั้ง (ครั้ง)</th>
              <th className="density-col">สัดส่วนความหนาแน่น</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const pct = Math.round((row[sort] / maxValue) * 100);
              return (
                <tr key={row.code}>
                  <td><span className={`rank rank-${Math.min(row.rank, 4)}`}>{row.rank}</span></td>
                  <td><code className="icd-code">{row.code}</code></td>
                  <td>{row.nameTh ? <>{row.nameTh}<small className="icd-en">{row.name}</small></> : row.name}</td>
                  <td className={`num${sort === 'patients' ? ' emphasis' : ''}`}>{formatNumber(row.patients)}</td>
                  <td className={`num${sort === 'visits' ? ' emphasis' : ''}`}>{formatNumber(row.visits)}</td>
                  <td className="density-col">
                    <span className="density"><span className="density-bar"><span style={{ width: `${pct}%` }} /></span><em>{pct}%</em></span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="empty">ไม่พบรหัสโรคที่ค้นหา</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}
