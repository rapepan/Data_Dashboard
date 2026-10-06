import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import PageSkeleton from '../../components/PageSkeleton';
import { useMinDelay } from '../../hooks/useMinDelay';
import Modal from '../../components/Modal';
import FeedbackTimeline from '../../components/FeedbackTimeline';
import { ApiError } from '../../services/apiClient';
import { toast } from '../../utils/toast';
import { FEEDBACK_CATEGORY, FEEDBACK_CHANGED_EVENT, FEEDBACK_STATUS, feedbackImageUrl, feedbackService, type FeedbackEntry, type FeedbackStatus, type PageConfirmation } from '../../services/feedbackService';
import { NAV_GROUPS, NAV_PARENTS } from '../../routes/navigation';

/** หน้ารายงานทั้งหมด (ชื่อตรงกับตัวเลือก "หน้าที่ยืนยันข้อมูล" ในฟอร์มติดต่อผู้พัฒนา) · หน้ากำลังพัฒนาแสดงไว้แต่ไม่นับ */
const ALL_PAGES = NAV_GROUPS.flatMap(g => g.items)
  .filter(item => !item.hidden && item.key !== 'contact' && item.key !== 'my-feedback' && item.page !== 'admin');
const REPORT_PAGES = ALL_PAGES.filter(item => !item.wip);

/** "02/10/2569" */
const dmy = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`; };

/** การ์ดสรุป: หน้าไหนมีผู้ใช้ยืนยันว่าใช้ข้อมูลตามระบบแล้ว / หน้าไหนยังไม่มี */
function ConfirmationSummary({ confirmations }: { confirmations: PageConfirmation[] }) {
  const byPage = new Map(confirmations.map(c => [c.page, c]));
  const done = REPORT_PAGES.filter(p => byPage.has(p.label)).length;
  return (
    <article className="card-box confirm-summary">
      <header>
        <span className="confirm-summary-icon"><i className="fa-solid fa-circle-check" /></span>
        <div>
          <strong>หน้าที่ได้รับการยืนยันข้อมูลแล้ว</strong>
          <small>ผู้ใช้ตรวจสอบแล้ว ใช้ข้อมูลตามที่ระบบแสดง ไม่ต้องแก้ไข (ประเภท "ยืนยันข้อมูล" ในหน้าติดต่อผู้พัฒนา)</small>
        </div>
        <span className="confirm-summary-count"><b>{done}</b> / {REPORT_PAGES.length} หน้า</span>
      </header>
      <ul className="confirm-pages">
        {ALL_PAGES.map(p => {
          const parent = p.parent ? NAV_PARENTS[p.parent]?.label : undefined;
          if (p.wip) return (
            <li key={p.key} className="is-wip">
              <i className={`fa-solid ${p.icon} confirm-page-icon`} />
              <div>
                {parent && <span className="confirm-page-parent">{parent}</span>}
                <span className="confirm-page-name">{p.label}</span>
                <small className="muted">กำลังพัฒนา (ไม่นับ)</small>
              </div>
            </li>
          );
          const c = byPage.get(p.label);
          const latest = c?.people[0];
          const others = (c?.people.length ?? 0) - 1;
          return (
            <li key={p.key} className={c ? 'is-done' : undefined}>
              <i className={`fa-solid ${p.icon} confirm-page-icon`} />
              <div>
                {parent && <span className="confirm-page-parent">{parent}</span>}
                <span className="confirm-page-name">{p.label}</span>
                {latest
                  ? <small data-tip={c!.people.map(x => `${x.name}${x.position ? ` (${x.position})` : ''} · ${dmy(x.time)}`).join('\n')}>
                      <i className="fa-solid fa-check" /> {latest.name} · {dmy(latest.time)}{others > 0 && ` · และอีก ${others} คน`}
                    </small>
                  : <small className="muted">ยังไม่มีการยืนยัน</small>}
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

type Filter = 'all' | FeedbackStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'new', label: 'ยังไม่ดำเนินการ' },
  { key: 'in_progress', label: 'กำลังดำเนินการ' },
  { key: 'done', label: 'ดำเนินการแล้ว' },
  { key: 'all', label: 'ทั้งหมด' },
];

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** ผู้ดูแลระบบ: เรื่องที่ผู้ทดสอบ/ผู้ใช้แจ้งมาจากหน้า "ติดต่อผู้พัฒนา" */
export default function FeedbackPage() {
  const [filter, setFilter] = useState<Filter>('new');
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [confirmations, setConfirmations] = useState<PageConfirmation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const skeletonDone = useMinDelay();
  const [counts, setCounts] = useState<Record<Filter, number>>({ all: 0, new: 0, in_progress: 0, done: 0 });
  // เรื่องที่กำลังอัปเดตสถานะ (เปิดหน้าต่าง)
  const [editing, setEditing] = useState<FeedbackEntry | null>(null);
  const [nextStatus, setNextStatus] = useState<FeedbackStatus>('in_progress');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await feedbackService.list(filter === 'all' ? undefined : filter);
      setEntries(result.entries);
      setCounts(result.counts);
      setConfirmations(result.confirmations ?? []);
    } catch { /* 401/403 จัดการโดยระบบ login */ }
    setLoaded(true);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const openEditor = (entry: FeedbackEntry) => {
    setEditing(entry);
    // ขั้นถัดไปที่น่าจะเลือก: ยังไม่ดำเนินการ → กำลังดำเนินการ → ดำเนินการแล้ว
    setNextStatus(entry.status === 'new' ? 'in_progress' : 'done');
    setNote('');
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await feedbackService.setStatus(editing.id, nextStatus, note.trim() || undefined);
      toast(`อัปเดตเรื่อง #${editing.id} เป็น "${FEEDBACK_STATUS[nextStatus].label}" แล้ว — ผู้แจ้งจะเห็นในหน้า "เรื่องที่แจ้ง"`, 'success');
      setEditing(null);
      await load();
      window.dispatchEvent(new Event(FEEDBACK_CHANGED_EVENT));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="แจ้งปัญหา / ข้อเสนอแนะ"
        subtitle="เรื่องที่ผู้ใช้ส่งมาจากหน้า “ติดต่อผู้พัฒนา” — กดปุ่มสถานะเพื่ออัปเดตและตอบกลับผู้แจ้ง"
        actions={
          <div className="filter-bar">
            <div className="segmented">
              {FILTERS.map(f => (
                <button key={f.key} className={filter === f.key ? 'active' : ''} onClick={() => setFilter(f.key)}>
                  {f.label} <span className="count-pill">{counts[f.key]}</span>
                </button>
              ))}
            </div>
            <button className="filter-refresh" onClick={load} data-tip="รีเฟรช"><i className="fa-solid fa-arrows-rotate" /></button>
          </div>
        }
      />

      {!(loaded && skeletonDone) ? <PageSkeleton cards={0} rows={[]} table={6} columns={6} /> : (
      <>
      <ConfirmationSummary confirmations={confirmations} />
      <article className="card-box table-card">
        <div className="table-responsive">
          <table className="rank-table feedback-table">
            <thead>
              <tr><th>เวลา</th><th>ประเภท</th><th>หน้า</th><th>รายละเอียด</th><th>ผู้แจ้ง</th><th>สถานะ</th></tr>
            </thead>
            <tbody>
              {entries.map(entry => {
                const meta = FEEDBACK_CATEGORY[entry.category] ?? FEEDBACK_CATEGORY.other;
                return (
                  <tr key={entry.id}>
                    <td className="nowrap">{formatTime(entry.time)}<small className="muted block">#{entry.id}</small></td>
                    <td><span className={`action-badge tone-${meta.tone}`}><i className={`fa-solid ${meta.icon}`} /> {meta.label}</span></td>
                    <td>{entry.page}</td>
                    <td className="feedback-message">
                      {entry.message}
                      {entry.images && entry.images.length > 0 && (
                        <span className="feedback-images">
                          {entry.images.map((img, i) => (
                            <a key={img.file} href={feedbackImageUrl(entry.id, img.file)} target="_blank" rel="noreferrer" data-tip="คลิกเพื่อเปิดรูปขนาดเต็ม">
                              <img src={feedbackImageUrl(entry.id, img.file)} alt={`รูปแนบ ${i + 1}`} loading="lazy" />
                            </a>
                          ))}
                        </span>
                      )}
                      {entry.imagesPurged && <small className="muted block"><i className="fa-solid fa-image" /> รูปแนบถูกลบตามกำหนดเก็บ 90 วันแล้ว</small>}
                    </td>
                    <td>
                      {entry.name ?? <span className="muted">ไม่ระบุชื่อ</span>}
                      {entry.position && <small className="muted block"><i className="fa-solid fa-building" /> {entry.position}</small>}
                      {entry.loginname && <small className="muted block"><i className="fa-solid fa-user-check" /> {entry.loginname}</small>}
                      {entry.contactPhone && <small className="block"><i className="fa-solid fa-phone" /> <a href={`tel:${entry.contactPhone.replace(/[^0-9+]/g, '')}`}>{entry.contactPhone}</a></small>}
                      {entry.contactLine && <small className="block"><i className="fa-brands fa-line" /> LINE ID: {entry.contactLine}</small>}
                      {entry.lineQr && (
                        <a className="feedback-line-qr" href={feedbackImageUrl(entry.id, entry.lineQr.file)} target="_blank" rel="noreferrer" data-tip="QR Code LINE ของผู้แจ้ง — คลิกเพื่อดูรูปใหญ่">
                          <img src={feedbackImageUrl(entry.id, entry.lineQr.file)} alt="QR Code LINE ของผู้แจ้ง" loading="lazy" /> <small><i className="fa-brands fa-line" /> QR Code LINE</small>
                        </a>
                      )}
                      {!entry.contactPhone && !entry.contactLine && !entry.lineQr && entry.contact && <small className="block"><i className="fa-solid fa-phone" /> {entry.contact}</small>}
                    </td>
                    <td>
                      <button className={`status-toggle tone-${FEEDBACK_STATUS[entry.status].tone}`} onClick={() => openEditor(entry)} data-tip="อัปเดตสถานะ / ตอบกลับผู้แจ้ง">
                        <i className={`fa-solid ${FEEDBACK_STATUS[entry.status].icon}`} />
                        {FEEDBACK_STATUS[entry.status].label}
                        <i className="fa-solid fa-pen fb-edit" />
                      </button>
                      {entry.history && entry.history.length > 0 && (
                        <small className="muted block">อัปเดต {entry.history.length} ครั้ง · ล่าสุด {formatTime(entry.history[entry.history.length - 1].time)}</small>
                      )}
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 && <tr><td colSpan={6} className="empty">ไม่มีรายการ</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
      </>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        accent="indigo"
        icon="fa-pen-to-square"
        title={editing ? `อัปเดตเรื่อง #${editing.id}` : ''}
        subtitle={editing ? `${FEEDBACK_CATEGORY[editing.category]?.label ?? ''} · ${editing.page} · ${editing.name ?? ''}` : undefined}
        footerNote={<><i className="fa-solid fa-circle-info" /> ผู้แจ้งเห็นสถานะและข้อความในหน้า "เรื่องที่แจ้ง" และมีการแจ้งเตือนที่กระดิ่ง</>}
      >
        {editing && (
          <div className="fb-editor">
            <p className="fb-editor-message">{editing.message}</p>
            <div className="fb-editor-field">
              <span className="contact-label">สถานะ</span>
              <div className="fb-status-picker">
                {(Object.keys(FEEDBACK_STATUS) as FeedbackStatus[]).map(key => (
                  <button key={key} type="button" className={`category-option tone-${FEEDBACK_STATUS[key].tone}${nextStatus === key ? ' active' : ''}`} onClick={() => setNextStatus(key)} aria-pressed={nextStatus === key}>
                    <i className={`fa-solid ${FEEDBACK_STATUS[key].icon}`} />
                    {FEEDBACK_STATUS[key].label}
                  </button>
                ))}
              </div>
            </div>
            <label className="contact-field">
              <span className="contact-label">ข้อความถึงผู้แจ้ง <small>(ไม่บังคับ)</small></span>
              <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 1000))} rows={3} placeholder="เช่น รับเรื่องแล้ว กำลังตรวจสอบ / แก้ไขแล้ว ลองรีเฟรชหน้าอีกครั้ง" />
            </label>
            <div className="fb-editor-actions">
              <button type="button" className="btn-primary" onClick={() => { void save(); }} disabled={saving || (nextStatus === editing.status && !note.trim())}>
                <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
            <div className="fb-editor-history">
              <span className="contact-label">ไทม์ไลน์</span>
              <FeedbackTimeline entry={editing} showBy />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
