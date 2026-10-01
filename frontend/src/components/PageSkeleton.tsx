interface PageSkeletonProps {
  /** จำนวนการ์ดสรุปแถวบน */
  cards?: number;
  /** กล่องแต่ละแถว เช่น [3, 2] = แถวแรก 3 กล่อง แถวสอง 2 กล่อง */
  rows?: number[];
  /** ตาราง: จำนวนแถวข้อมูล (0 = ไม่มีตาราง) */
  table?: number;
  /** จำนวนคอลัมน์ของตาราง */
  columns?: number;
}

/**
 * โครงหน้าจอกะพริบระหว่างโหลด — รูปทรงเหมือนการ์ด/กราฟจริงของหน้า
 * ใช้แทน spinner กลางจอทั้งระบบ — ตอนเข้าหน้า และตอนเปลี่ยนตัวกรอง/กดรีเฟรช
 */
export default function PageSkeleton({ cards = 4, rows = [3, 2], table = 0, columns = 5 }: PageSkeletonProps) {
  return (
    <div className="page-skeleton" role="status" aria-label="กำลังโหลดข้อมูล">
      {cards > 0 && (
        <div className="sk-grid" style={{ ['--cols' as string]: Math.min(cards, 7) }}>
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="sk-card">
              <span className="sk sk-line w-60" />
              <span className="sk sk-value" />
              <span className="sk sk-line w-40" />
            </div>
          ))}
        </div>
      )}
      {rows.map((count, r) => (
        <div key={r} className="sk-grid" style={{ ['--cols' as string]: count }}>
          {Array.from({ length: count }, (_, i) => (
            <div key={i} className="sk-panel">
              <span className="sk sk-line w-50" />
              <span className="sk sk-line w-30" />
              <span className="sk sk-chart" />
            </div>
          ))}
        </div>
      ))}
      {table > 0 && (
        <div className="sk-table">
          <div className="sk-table-row head" style={{ ['--cols' as string]: columns }}>
            {Array.from({ length: columns }, (_, c) => <span key={c} className="sk sk-line w-50" />)}
          </div>
          {Array.from({ length: table }, (_, r) => (
            <div key={r} className="sk-table-row" style={{ ['--cols' as string]: columns }}>
              {Array.from({ length: columns }, (_, c) => <span key={c} className={`sk sk-line ${c % 2 ? 'w-60' : 'w-40'}`} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
