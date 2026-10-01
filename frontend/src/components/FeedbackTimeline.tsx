import { FEEDBACK_STATUS, type FeedbackEntry } from '../services/feedbackService';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * ไทม์ไลน์ของเรื่องแจ้งปัญหา: แจ้งเรื่อง → ผู้ดูแลเปลี่ยนสถานะ/ตอบกลับ (ล่าสุดอยู่ล่างสุด)
 * showBy = แสดงชื่อผู้ดูแลที่ดำเนินการ (หน้าผู้ดูแล)
 */
export default function FeedbackTimeline({ entry, showBy = false }: { entry: FeedbackEntry; showBy?: boolean }) {
  const history = entry.history ?? [];
  return (
    <ol className="fb-timeline">
      <li className="fb-step tone-slate">
        <span className="fb-dot"><i className="fa-solid fa-paper-plane" /></span>
        <div>
          <b>แจ้งเรื่อง</b>
          <small>{formatTime(entry.time)}{entry.name ? ` · ${entry.name}` : ''}</small>
        </div>
      </li>
      {history.map((h, i) => {
        const meta = FEEDBACK_STATUS[h.status];
        return (
          <li key={i} className={`fb-step tone-${meta.tone}`}>
            <span className="fb-dot"><i className={`fa-solid ${meta.icon}`} /></span>
            <div>
              <b>{meta.label}</b>
              <small>{formatTime(h.time)}{showBy && (h.byName || h.by) ? ` · โดย ${h.byName ?? h.by}` : ''}</small>
              {h.note && <p className="fb-note"><i className="fa-solid fa-comment" /> {h.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
