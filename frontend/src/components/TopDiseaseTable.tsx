import { useMemo, useState } from 'react';
import type { TopDiseaseItem } from '../types/dashboard';
import { formatNumber } from '../utils/format';
import { exportToExcel } from '../utils/exportExcel';
import ExportButton from './ExportButton';
import ExportPair from './report/ExportPair';
import TopLimitSelect from './report/TopLimitSelect';

interface TopDiseaseTableProps {
  kind: 'opd' | 'ipd';
  title: string;
  icon: string;
  fiscalLabel: string;
  periodLabel: string;
  /** ช่วงวันที่ (ISO) ใช้ตั้งชื่อไฟล์ Excel */
  start: string;
  end: string;
  items: TopDiseaseItem[];
}


const EXPORT_NAME = { opd: 'อันดับโรคผู้ป่วยนอก', ipd: 'อันดับโรคผู้ป่วยใน' };

type RankedDisease = TopDiseaseItem & { rank: number };

function exportDiseases(filename: string, rows: RankedDisease[]) {
  return exportToExcel<RankedDisease>({
    filename,
    rows,
    columns: [
      { header: 'อันดับ', value: row => row.rank, width: 9, align: 'center' },
      { header: 'รหัสโรค', value: row => row.code, width: 12, mono: true },
      { header: 'ชื่อโรค (ภาษาไทย)', value: row => row.nameTh ?? '', width: 50 },
      { header: 'ชื่อโรค (ICD10 Name)', value: row => row.name, width: 60 },
      { header: 'จำนวนราย', value: row => row.count, width: 12, align: 'right', bold: true, numFmt: '#,##0' },
    ],
  });
}

export default function TopDiseaseTable({ kind, title, icon, fiscalLabel, periodLabel, start, end, items }: TopDiseaseTableProps) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(10);
  const filename = `${EXPORT_NAME[kind]}_${start}_ถึง_${end}`;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ranked = items.map((item, i) => ({ ...item, rank: i + 1 }));
    return (q ? ranked.filter(item => item.code.toLowerCase().includes(q) || item.name.toLowerCase().includes(q) || Boolean(item.nameTh?.includes(q))) : ranked).slice(0, limit);
  }, [items, query, limit]);

  return (
    <article className="card-box table-card" data-kind={kind}>
      <div className="table-card-head">
        <div>
          <strong><i className={`fa-solid ${icon}`} /> {title}</strong>
          <small><span className="fy-badge">{fiscalLabel}</span>{periodLabel}</small>
        </div>
        <div className="table-tools">
          <label className="table-search"><i className="fa-solid fa-magnifying-glass" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหารหัส/ชื่อโรค..." /></label>
          <TopLimitSelect value={limit} onChange={setLimit} />
          <ExportButton kind="excel" detail={`${filename}.xlsx (${rows.length} แถว)`} onRun={() => exportDiseases(filename, rows)} />
          <ExportPair title={title} excel={false} />
        </div>
      </div>
      <div className="table-responsive">
        <table className="rank-table">
          <thead>
            <tr><th>อันดับ</th><th>รหัสโรค</th><th>ชื่อโรค</th><th className="num">จำนวนราย</th></tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.code}>
                <td><span className={`rank rank-${Math.min(row.rank, 4)}`}>{row.rank}</span></td>
                <td><code className="icd-code">{row.code}</code></td>
                <td>{row.nameTh ? <>{row.nameTh}<small className="icd-en">{row.name}</small></> : row.name}</td>
                <td className="num">{formatNumber(row.count)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="empty">ไม่พบข้อมูล</td></tr>}
          </tbody>
        </table>
      </div>
    </article>
  );
}
