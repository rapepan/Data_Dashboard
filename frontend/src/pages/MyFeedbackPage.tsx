import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import FeedbackTimeline from '../components/FeedbackTimeline';
import { useMinDelay } from '../hooks/useMinDelay';
import { MY_FEEDBACK_SEEN_EVENT } from '../hooks/useMyFeedbackSummary';
import { FEEDBACK_CATEGORY, FEEDBACK_STATUS, feedbackService, myFeedbackImageUrl, type FeedbackEntry } from '../services/feedbackService';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** ผู้ใช้ที่ login: ติดตามสถานะเรื่องที่ตัวเองแจ้งมาจากหน้า "ติดต่อผู้พัฒนา" */
export default function MyFeedbackPage() {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const skeletonDone = useMinDelay();

  const load = useCallback(async () => {
    try {
      const result = await feedbackService.mine();
      setEntries(result.entries);
      // เปิดดูแล้ว → ความเคลื่อนไหวทั้งหมดถือว่าเห็นแล้ว (ไฮไลต์ในหน้านี้ยังคงอยู่จนกว่าจะโหลดใหม่)
      if (result.unread > 0) {
        await feedbackService.mineSeen().catch(() => undefined);
        window.dispatchEvent(new Event(MY_FEEDBACK_SEEN_EVENT));
      }
    } catch { /* 401 จัดการโดยระบบ login */ }
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const unread = entries.filter(e => e.unread).length;

  return (
    <>
      <PageHeader
        title="เรื่องที่แจ้ง"
        subtitle="ติดตามสถานะปัญหา / ข้อเสนอแนะที่คุณแจ้งไว้ และข้อความตอบกลับจากผู้ดูแลระบบ"
        actions={
          <div className="filter-bar">
            <Link to="/contact" className="btn-primary"><i className="fa-solid fa-plus" /> แจ้งเรื่องใหม่</Link>
            <button className="filter-refresh" onClick={load} data-tip="รีเฟรช"><i className="fa-solid fa-arrows-rotate" /></button>
          </div>
        }
      />

      {!(loaded && skeletonDone) ? <PageSkeleton cards={0} rows={[1, 1]} /> : entries.length === 0 ? (
        <article className="card-box myfb-empty">
          <i className="fa-solid fa-inbox" />
          <strong>ยังไม่มีเรื่องที่แจ้ง</strong>
          <p>พบปัญหาหรืออยากให้ปรับการแสดงข้อมูลส่วนไหน แจ้งผู้พัฒนาได้ที่หน้า “ติดต่อผู้พัฒนา”</p>
          <Link to="/contact" className="btn-primary"><i className="fa-solid fa-headset" /> ไปหน้าติดต่อผู้พัฒนา</Link>
        </article>
      ) : (
        <>
          {unread > 0 && (
            <p className="myfb-banner"><i className="fa-solid fa-bell" /> มีความเคลื่อนไหวใหม่ {unread} เรื่อง</p>
          )}
          <div className="myfb-list">
            {entries.map(entry => {
              const cat = FEEDBACK_CATEGORY[entry.category] ?? FEEDBACK_CATEGORY.other;
              const status = FEEDBACK_STATUS[entry.status];
              return (
                <article key={entry.id} className={`card-box myfb-card${entry.unread ? ' unread' : ''}`}>
                  <header className="myfb-head">
                    <span className={`action-badge tone-${cat.tone}`}><i className={`fa-solid ${cat.icon}`} /> {cat.label}</span>
                    <span className="myfb-page"><i className="fa-solid fa-file-lines" /> {entry.page}</span>
                    {entry.unread && <span className="myfb-new">ใหม่</span>}
                    <span className={`status-pill tone-${status.tone}`}><i className={`fa-solid ${status.icon}`} /> {status.label}</span>
                  </header>
                  <p className="myfb-message">{entry.message}</p>
                  {entry.images && entry.images.length > 0 && (
                    <span className="feedback-images">
                      {entry.images.map((img, i) => (
                        <a key={img.file} href={myFeedbackImageUrl(entry.id, img.file)} target="_blank" rel="noreferrer" data-tip="คลิกเพื่อเปิดรูปขนาดเต็ม">
                          <img src={myFeedbackImageUrl(entry.id, img.file)} alt={`รูปแนบ ${i + 1}`} loading="lazy" />
                        </a>
                      ))}
                    </span>
                  )}
                  {entry.imagesPurged && <small className="muted block"><i className="fa-solid fa-image" /> รูปแนบถูกลบตามกำหนดเก็บ 90 วันแล้ว</small>}
                  <div className="myfb-timeline">
                    <FeedbackTimeline entry={entry} />
                  </div>
                  <footer className="myfb-foot">
                    <small className="muted">#{entry.id} · แจ้งเมื่อ {formatTime(entry.time)}{entry.updatedAt ? ` · อัปเดตล่าสุด ${formatTime(entry.updatedAt)}` : ''}</small>
                  </footer>
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
