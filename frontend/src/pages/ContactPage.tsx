import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLoginRedirect } from '../auth/useLoginRedirect';
import PageHeader from '../components/PageHeader';
import PageSkeleton from '../components/PageSkeleton';
import { useMinDelay } from '../hooks/useMinDelay';
import Select from '../components/ui/Select';
import { useAuth } from '../auth/AuthContext';
import { DEVELOPER_TEAM, type DeveloperContact } from '../config/contact';
import { NAV_GROUPS } from '../routes/navigation';
import { ApiError, apiGet } from '../services/apiClient';
import { FEEDBACK_CATEGORY, feedbackService, type FeedbackCategory } from '../services/feedbackService';
import ImageAttach, { type AttachedImage } from '../components/ImageAttach';
import ConfirmDialog from '../components/ConfirmDialog';
import LineQrPicker from '../components/LineQrPicker';
import { formatThaiPhone, isThaiPhoneComplete } from '../utils/phone';

/** หน้าที่ผู้ทดสอบเลือกได้ว่าเกี่ยวกับหน้าไหน */
const PAGE_OPTIONS = [
  { value: 'ทั่วไป / ทั้งระบบ', label: 'ทั่วไป / ทั้งระบบ' },
  { value: 'หน้าเข้าสู่ระบบ', label: 'หน้าเข้าสู่ระบบ' },
  ...NAV_GROUPS.flatMap(g => g.items)
    .filter(item => !item.hidden && !item.wip && item.key !== 'contact' && item.key !== 'my-feedback' && item.page !== 'admin')
    .map(item => ({ value: item.label, label: item.label })),
];

const MESSAGE_MAX = 5000;
/** ยืนยันข้อมูล: ไม่กรอกรายละเอียด = ส่งข้อความนี้ (backend ใช้ข้อความเดียวกัน) */
const CONFIRM_MESSAGE = 'ตรวจสอบแล้ว ใช้ข้อมูลตามที่ระบบแสดงอยู่ ไม่ต้องแก้ไข';
/** หน้าที่ยืนยันข้อมูลได้ — เฉพาะหน้ารายงาน (ไม่รวม "ทั่วไป" / หน้าเข้าสู่ระบบ) */
const CONFIRM_PAGE_OPTIONS = PAGE_OPTIONS.slice(2);

/** แปลงเบอร์เป็นลิงก์โทรออก (ตัดขีด/ช่องว่าง) */
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

export default function ContactPage() {
  const { user } = useAuth();
  const goLogin = useLoginRedirect();
  const skeletonDone = useMinDelay();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [page, setPage] = useState(PAGE_OPTIONS[0].value);
  const [message, setMessage] = useState('');
  // ผู้ที่ login อยู่: ชื่อและหน่วยงานมาจาก HOSxP แก้ไม่ได้ (backend ก็ใช้ค่าจาก session เสมอ)
  // ยกเว้นบัญชีที่ HOSxP ไม่ได้ระบุหน่วยงาน จึงกรอกหน่วยงานเอง
  const [nameInput, setName] = useState('');
  const [positionInput, setPosition] = useState('');
  const nameLocked = Boolean(user);
  const positionLocked = Boolean(user?.position);
  const name = nameLocked ? user!.displayName : nameInput;
  const position = positionLocked ? user!.position! : positionInput;
  // ช่องทางติดต่อกลับ: บังคับทั้งเบอร์โทร และ LINE (เลือกกรอก ID หรือ QR Code อย่างใดอย่างหนึ่ง)
  const [phone, setPhone] = useState('');
  const [lineMode, setLineMode] = useState<'id' | 'qr'>('id');
  const [lineId, setLineId] = useState('');
  const [lineQr, setLineQr] = useState<string | null>(null);
  const hasContact = Boolean(isThaiPhoneComplete(phone) && (lineMode === 'id' ? lineId.trim() : lineQr));
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);

  // รายชื่อ/เบอร์โทรผู้พัฒนา — ขอจาก backend เฉพาะตอน login (ผู้เยี่ยมชมไม่เห็นการ์ดนี้ และไม่มีเบอร์อยู่ในไฟล์หน้าเว็บ)
  const [contacts, setContacts] = useState<DeveloperContact[]>([]);
  useEffect(() => {
    if (!user) { setContacts([]); return; }
    let cancelled = false;
    apiGet<{ people: DeveloperContact[] }>('/contact/people')
      .then(r => { if (!cancelled) setContacts(r.people); })
      .catch(() => { /* ไม่แสดงการ์ด */ });
    return () => { cancelled = true; };
  }, [user]);

  const confirming = category === 'confirm';
  const [askConfirm, setAskConfirm] = useState(false);
  // เปลี่ยนเป็น "ยืนยันข้อมูล" → ต้องเป็นหน้ารายงาน · ไม่ต้องแนบรูป
  const pickCategory = (key: FeedbackCategory) => {
    setCategory(key);
    if (key === 'confirm' && !CONFIRM_PAGE_OPTIONS.some(o => o.value === page)) setPage(CONFIRM_PAGE_OPTIONS[0].value);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // ยืนยันข้อมูล: ถามซ้ำอีกครั้งก่อนส่ง (กันกดผิดหน้า)
    if (confirming) setAskConfirm(true);
    else void send();
  };

  const send = async () => {
    setAskConfirm(false);
    setError(null);
    setSending(true);
    try {
      const result = await feedbackService.submit({
        category, page, message: message.trim(), position: position.trim(), phone: phone.trim(),
        lineId: lineMode === 'id' ? lineId.trim() : '', lineQr: lineMode === 'qr' ? lineQr ?? undefined : undefined,
        images: confirming ? [] : images.map(img => img.dataUrl),
      });
      setSentId(result.id);
      setMessage('');
      setPhone('');
      setLineId('');
      setLineQr(null);
      setImages([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ส่งไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader
        title="ติดต่อผู้พัฒนา"
        subtitle="พบปัญหา ข้อมูลไม่ถูกต้อง หรือมีข้อเสนอแนะ แจ้งทีมผู้พัฒนาได้ที่หน้านี้ — ทุกความเห็นช่วยให้ระบบดีขึ้น"
      />

      {!skeletonDone ? <PageSkeleton cards={0} rows={[2]} /> : (
      <section className="contact-layout">
        <div className="contact-side">
          <article className="card-box contact-team">
            <span className="contact-team-icon"><i className="fa-solid fa-code" /></span>
            <div>
              <strong>{DEVELOPER_TEAM.name}</strong>
              <small>{DEVELOPER_TEAM.organization}</small>
              {DEVELOPER_TEAM.hours && <small><i className="fa-solid fa-clock" /> {DEVELOPER_TEAM.hours}</small>}
            </div>
          </article>

          {contacts.map(person => (
            <article key={person.name || person.email || person.phone} className="card-box contact-person">
              <div className="contact-person-head">
                <span className="contact-avatar"><i className="fa-solid fa-user" /></span>
                <div>
                  <strong>{person.name || 'ผู้พัฒนาระบบ'}</strong>
                  {person.role && <small>{person.role}</small>}
                </div>
              </div>
              <ul className="contact-channels">
                {person.phone && <li><i className="fa-solid fa-phone" /><a href={telHref(person.phone)}>{person.phone}</a></li>}
                {person.email && <li><i className="fa-solid fa-envelope" /><a href={`mailto:${person.email}`}>{person.email}</a></li>}
                {person.line && <li><i className="fa-brands fa-line" /><span>Line: {person.line}</span></li>}
              </ul>
              {person.lineQr && DEVELOPER_TEAM.lineQr && (
                <div className="contact-person-qr">
                  <img src={DEVELOPER_TEAM.lineQr} alt={`QR Code เพิ่มเพื่อน LINE ${person.name}`} onError={e => { e.currentTarget.closest('.contact-person-qr')?.setAttribute('hidden', ''); }} />
                  <div>
                    <strong><i className="fa-brands fa-line" /> ติดต่อผ่าน LINE</strong>
                    <p>สแกน QR Code ด้วยแอป LINE เพื่อเพิ่มเพื่อนและพูดคุยกับ{'ผู้พัฒนา'}โดยตรง</p>
                    <small><i className="fa-solid fa-mobile-screen" /> LINE › เพิ่มเพื่อน › QR Code</small>
                  </div>
                </div>
              )}
            </article>
          ))}

          {DEVELOPER_TEAM.lineQr && (

          <article className="card-box contact-tips">
            <strong><i className="fa-solid fa-clipboard-check" /> แจ้งปัญหาให้แก้ได้เร็ว</strong>
            <ol>
              <li>บอกว่าอยู่ <b>หน้าไหน</b> และเลือกช่วงวันที่อะไรไว้</li>
              <li>เล่าว่า <b>กดอะไร</b> แล้ว <b>เกิดอะไรขึ้น</b></li>
              <li>ถ้าตัวเลขไม่ตรง บอก <b>ค่าที่ควรจะเป็น</b> และแหล่งที่ใช้เทียบ</li>
              <li>ทิ้งช่องทางติดต่อกลับ เผื่อทีมต้องสอบถามเพิ่ม</li>
            </ol>
          </article>
          )}

          {/* LINE ส่วนตัวของผู้พัฒนา — แสดงเฉพาะผู้ที่ login (ถ้ามีคนตั้ง lineQr ไว้ แสดงในการ์ดของคนนั้นแทน) */}
          {user && DEVELOPER_TEAM.lineQr && !contacts.some(c => c.lineQr) && (
          <article className="card-box contact-line">
              <img src={DEVELOPER_TEAM.lineQr} alt="QR Code เพิ่มเพื่อน LINE ผู้พัฒนา" onError={e => { e.currentTarget.closest('article')?.setAttribute('hidden', ''); }} />
              <div>
                <strong><i className="fa-brands fa-line" /> ติดต่อผ่าน LINE</strong>
                <p>สแกน QR Code ด้วยแอป LINE เพื่อเพิ่มเพื่อนและพูดคุยกับผู้พัฒนาโดยตรง</p>
                <small><i className="fa-solid fa-mobile-screen" /> ใช้มือถือ: LINE › เพิ่มเพื่อน › QR Code</small>
              </div>
          </article>
          )}
        </div>

        <article className="card-box contact-form-card">
          {!user ? (
            // ต้อง login ก่อนแจ้งปัญหา — จะได้รู้ว่าใครแจ้ง และผู้แจ้งติดตามสถานะได้
            <div className="contact-login-gate">
              <span className="contact-sent-icon"><i className="fa-solid fa-lock" /></span>
              <strong>กรุณาเข้าสู่ระบบเพื่อแจ้งปัญหา</strong>
              <p>ใช้ชื่อผู้ใช้และรหัสผ่านเดียวกับ HOSxP — เมื่อแจ้งแล้วติดตามสถานะการแก้ไขได้ที่หน้า "เรื่องที่แจ้ง"</p>
              <button type="button" className="btn-primary" onClick={goLogin}><i className="fa-solid fa-right-to-bracket" /> เข้าสู่ระบบ</button>
              <small><i className="fa-solid fa-circle-question" /> เข้าสู่ระบบไม่ได้? ติดต่อ{DEVELOPER_TEAM.name}</small>
            </div>
          ) : sentId ? (
            <div className="contact-sent">
              <span className="contact-sent-icon"><i className="fa-solid fa-check" /></span>
              <strong>{confirming ? `บันทึกการยืนยันข้อมูลหน้า "${page}" แล้ว ขอบคุณครับ/ค่ะ` : 'ส่งเรื่องเรียบร้อยแล้ว ขอบคุณครับ/ค่ะ'}</strong>
              <p>หมายเลขอ้างอิง <code>{sentId}</code> — ใช้อ้างอิงเมื่อสอบถามทีมผู้พัฒนา</p>
              <div className="contact-sent-actions">
                <Link to="/my-feedback" className="btn-primary"><i className="fa-solid fa-list-check" /> ติดตามสถานะ</Link>
                <button type="button" className="btn-outline" onClick={() => setSentId(null)}>
                  <i className="fa-solid fa-plus" /> แจ้งเรื่องอื่นเพิ่ม
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="contact-form">
              <header>
                <strong><i className="fa-solid fa-paper-plane" /> แจ้งปัญหา / ข้อเสนอแนะ</strong>
                <small>ส่งในนาม {user.displayName} · ติดตามสถานะได้ที่ <Link to="/my-feedback">เรื่องที่แจ้ง</Link></small>
              </header>

              <fieldset className="contact-field">
                <legend>ประเภท</legend>
                <div className="category-picker">
                  {(Object.keys(FEEDBACK_CATEGORY) as FeedbackCategory[]).map(key => (
                    <button
                      key={key}
                      type="button"
                      className={`category-option tone-${FEEDBACK_CATEGORY[key].tone}${category === key ? ' active' : ''}`}
                      onClick={() => pickCategory(key)}
                      aria-pressed={category === key}
                    >
                      <i className={`fa-solid ${FEEDBACK_CATEGORY[key].icon}`} />
                      {FEEDBACK_CATEGORY[key].label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {confirming && (
                <p className="confirm-hint">
                  <i className="fa-solid fa-circle-check" /> ใช้เมื่อตรวจสอบตัวเลขในหน้านั้นแล้ว และ<b>ยืนยันว่าจะใช้ข้อมูลตามที่ระบบแสดงอยู่ ไม่ต้องแก้ไข</b>
                </p>
              )}

              <div className="contact-field">
                <span className="contact-label">{confirming ? <>หน้าที่ยืนยันข้อมูล <em>*</em></> : 'หน้าที่เกี่ยวข้อง'}</span>
                <Select<string> ariaLabel={confirming ? 'หน้าที่ยืนยันข้อมูล' : 'หน้าที่เกี่ยวข้อง'} value={page} options={confirming ? CONFIRM_PAGE_OPTIONS : PAGE_OPTIONS} onChange={setPage} />
              </div>

              <label className="contact-field">
                <span className="contact-label">{confirming ? 'หมายเหตุ (ไม่บังคับ)' : <>รายละเอียด <em>*</em></>}</span>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
                  rows={confirming ? 3 : 6}
                  required={!confirming}
                  minLength={confirming ? undefined : 5}
                  placeholder={confirming ? `"${CONFIRM_MESSAGE}"` : 'เช่น หน้าผู้ป่วยนอก (OPD) เลือกวันที่ 01/09/2569 – 23/09/2569 แล้วกราฟรายชั่วโมงไม่แสดง...'}
                />
                <small className="contact-count">{message.length.toLocaleString()} / {MESSAGE_MAX.toLocaleString()}</small>
              </label>

              {!confirming && <ImageAttach images={images} onChange={setImages} />}

              <div className="contact-row">
                <label className="contact-field">
                  <span className="contact-label">ชื่อผู้แจ้ง <em>*</em></span>
                  <div className={`contact-input${nameLocked ? ' locked' : ''}`}>
                    <input value={name} onChange={e => setName(e.target.value)} maxLength={80} required readOnly={nameLocked} placeholder="ชื่อ-สกุล" />
                    {nameLocked && <i className="fa-solid fa-lock" data-tip="ดึงจากบัญชี HOSxP แก้ไขไม่ได้" />}
                  </div>
                </label>
                <label className="contact-field">
                  <span className="contact-label">หน่วยงาน / ตำแหน่ง <em>*</em></span>
                  <div className={`contact-input${positionLocked ? ' locked' : ''}`}>
                    <input value={position} onChange={e => setPosition(e.target.value)} maxLength={120} required readOnly={positionLocked} placeholder="เช่น งานผู้ป่วยนอก / พยาบาลวิชาชีพ" />
                    {positionLocked && <i className="fa-solid fa-lock" data-tip="ดึงจากบัญชี HOSxP แก้ไขไม่ได้" />}
                  </div>
                </label>
              </div>

              <fieldset className="contact-field">
                <span className="contact-label">ช่องทางติดต่อกลับ <em>*</em> <small></small></span>
                <div className="contact-row contact-channels-form">
                  <label className="contact-field">
                    <span className="contact-sublabel"><i className="fa-solid fa-phone" /> เบอร์โทร <em>*</em></span>
                    <input type="tel" inputMode="numeric" required value={phone} onChange={e => setPhone(formatThaiPhone(e.target.value))} maxLength={12} placeholder="000-000-0000" aria-invalid={phone !== '' && !isThaiPhoneComplete(phone)} />
                    {phone !== '' && !isThaiPhoneComplete(phone) && <small className="contact-hint-error">กรอกเบอร์ให้ครบ 9–10 หลัก</small>}
                  </label>
                  <div className="contact-field">
                    <span className="contact-sublabel">
                      <i className="fa-brands fa-line" /> LINE <em>*</em>
                      <span className="segmented contact-line-mode" role="tablist">
                        <button type="button" role="tab" aria-selected={lineMode === 'id'} className={lineMode === 'id' ? 'active' : ''} onClick={() => setLineMode('id')}>LINE ID</button>
                        <button type="button" role="tab" aria-selected={lineMode === 'qr'} className={lineMode === 'qr' ? 'active' : ''} onClick={() => setLineMode('qr')}>QR Code</button>
                      </span>
                    </span>
                    {lineMode === 'id'
                      ? <input value={lineId} onChange={e => setLineId(e.target.value)} maxLength={50} required placeholder="LINE ID" />
                      : <LineQrPicker value={lineQr} onChange={setLineQr} />}
                  </div>
                </div>
              </fieldset>

              {error && <div className="login-error" role="alert"><i className="fa-solid fa-circle-exclamation" />{error}</div>}

              <div className="contact-actions">
                <small></small>
                <button type="submit" className="btn-primary" disabled={sending || (!confirming && message.trim().length < 5) || !name.trim() || !position.trim() || !hasContact}>
                  {sending ? 'กำลังส่ง...' : confirming ? <><i className="fa-solid fa-circle-check" /> ยืนยันข้อมูล</> : <><i className="fa-solid fa-paper-plane" /> ส่งเรื่อง</>}
                </button>
              </div>
            </form>
          )}
          <ConfirmDialog
            open={askConfirm}
            icon="fa-circle-check"
            title="ยืนยันข้อมูลหน้านี้?"
            message={`ยืนยันว่าข้อมูลหน้า "${page}" ถูกต้อง และจะใช้ข้อมูลตามที่ระบบแสดงอยู่ ไม่ต้องแก้ไข`}
            confirmLabel="ยืนยันข้อมูล"
            onConfirm={() => void send()}
            onCancel={() => setAskConfirm(false)}
          />
        </article>
      </section>
      )}
    </>
  );
}
