import { useCallback, useEffect, useState, type FormEvent } from 'react';
import PageHeader from '../../components/PageHeader';
import PageSkeleton from '../../components/PageSkeleton';
import ConfirmDialog from '../../components/ConfirmDialog';
import DatePicker from '../../components/ui/DatePicker';
import TimePicker from '../../components/ui/TimePicker';
import { NoticeBar, countdown, formatUntil, formatWindow } from '../../components/system/SystemNotices';
import RestartCard from '../../components/system/RestartCard';
import { useMinDelay } from '../../hooks/useMinDelay';
import { check as refreshSystemStatus } from '../../hooks/useSystemStatus';
import { ApiError } from '../../services/apiClient';
import { systemService, type AdminSystem, type NoticeLevel } from '../../services/systemService';
import { toIsoDate } from '../../utils/format';
import { NAV_GROUPS } from '../../routes/navigation';

type Notice = AdminSystem['notices'][number];

const LEVELS: { value: NoticeLevel; label: string; icon: string }[] = [
  { value: 'info', label: 'แจ้งให้ทราบ', icon: 'fa-bullhorn' },
  { value: 'warning', label: 'เตือน', icon: 'fa-triangle-exclamation' },
];

/** "01/10/2569 18:00" */
function formatDateTime(iso: string | null) {
  if (!iso) return '–';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** วันที่ (ISO) + เวลา (HH:MM) ตามเวลาเครื่อง → ISO */
const combine = (date: string, time: string) => new Date(`${date}T${time || '00:00'}:00`).toISOString();

/** หน้าที่เลือกปิดได้ พร้อมชื่อ/ไอคอนตามเมนู */
function pageOptions(keys: string[]) {
  const items = NAV_GROUPS.flatMap(g => g.items);
  return keys.map(key => {
    const item = items.find(i => (i.page ?? i.key) === key);
    return { key, label: item?.label ?? key, icon: item?.icon ?? 'fa-file' };
  });
}

/* ───────── ตั้งเวลาปิดเอง (โหมดปิดปรับปรุง / ปิดเฉพาะหน้า) ───────── */

interface Until { on: boolean; date: string; time: string }

/** ค่าตั้งต้น: เวลาที่ตั้งไว้แล้ว หรืออีก 30 นาทีข้างหน้า (ปัดขึ้นทีละ 5 นาที) */
function untilFrom(iso: string | null | undefined): Until {
  const d = iso ? new Date(iso) : new Date(Date.now() + 30 * 60_000);
  if (!iso) d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return { on: Boolean(iso), date: toIsoDate(d), time: timeOf(d) };
}
const untilIso = (u: Until) => (u.on ? combine(u.date, u.time) : null);

function UntilField({ value, onChange, label, hint }: { value: Until; onChange: (u: Until) => void; label: string; hint: string }) {
  const left = value.on ? Date.parse(combine(value.date, value.time)) - Date.now() : 0;
  return (
    <div className={`window-box until-box${value.on ? ' on' : ''}`}>
      <label className="window-toggle">
        <input type="checkbox" checked={value.on} onChange={e => onChange({ ...value, on: e.target.checked })} />
        <span><b>{label}</b><small>{hint}</small></span>
      </label>
      {value.on && (
        <div className="datetime-field">
          <DatePicker value={value.date} min={toIsoDate(new Date())} onChange={date => onChange({ ...value, date })} />
          <TimePicker value={value.time} onChange={time => onChange({ ...value, time })} ariaLabel={label} />
          <span className={`until-left${left <= 0 ? ' past' : ''}`}>{left <= 0 ? 'เวลานี้ผ่านไปแล้ว' : countdown(left)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * ข้อมูลที่ส่งบันทึก (และใช้แสดงตัวอย่าง) — มีเวลาปิดปรับปรุงแล้ว เลิกแสดงประกาศตอนเริ่มปิดปรับปรุง
 * (backend บังคับแบบเดียวกัน)
 */
function previewInput(form: Form) {
  const maintenanceStart = form.hasWindow ? combine(form.mStartDate, form.mStartTime) : null;
  const maintenanceEnd = form.hasWindow ? combine(form.mEndDate, form.mEndTime) : null;
  const endsAt = maintenanceStart ?? combine(form.endDate, form.endTime);
  return {
    message: form.message, level: form.level, startsAt: combine(form.startDate, form.startTime), endsAt,
    maintenanceStart, maintenanceEnd, autoMaintenance: form.hasWindow && form.autoMaintenance,
  };
}

function stateOf(n: Notice, now: number) {
  if (Date.parse(n.endsAt) <= now) return { key: 'ended', label: 'หมดเวลาแล้ว' };
  if (Date.parse(n.startsAt) > now) return { key: 'scheduled', label: 'รอแสดง' };
  return { key: 'live', label: 'กำลังแสดง' };
}

interface Form {
  id: number | null; message: string; level: NoticeLevel;
  /** ช่วงที่แสดงประกาศ */
  startDate: string; startTime: string; endDate: string; endTime: string;
  /** เวลาปิดปรับปรุงจริง (ไม่บังคับ) */
  hasWindow: boolean; mStartDate: string; mStartTime: string; mEndDate: string; mEndTime: string;
  autoMaintenance: boolean;
}

function emptyForm(): Form {
  const start = new Date();
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);
  // ค่าเริ่มต้นเวลาปิดปรับปรุง: วันนี้ ต้นชั่วโมงถัดไปที่ห่างจากตอนนี้อย่างน้อย 1 ชม. (15:50 → 17:00–17:30) — ข้ามเที่ยงคืนเป็นวันถัดไปเอง
  const mStart = new Date();
  mStart.setMinutes(0, 0, 0);
  mStart.setHours(mStart.getHours() + (new Date().getMinutes() > 0 ? 2 : 1));
  const mEnd = new Date(mStart.getTime() + 30 * 60_000);
  return {
    id: null, message: '', level: 'warning',
    startDate: toIsoDate(start), startTime: timeOf(start), endDate: toIsoDate(end), endTime: timeOf(end),
    hasWindow: false, mStartDate: toIsoDate(mStart), mStartTime: timeOf(mStart), mEndDate: toIsoDate(mEnd), mEndTime: timeOf(mEnd),
    autoMaintenance: false,
  };
}

export default function SystemPage() {
  const [data, setData] = useState<AdminSystem | null>(null);
  const skeletonDone = useMinDelay();
  const [form, setForm] = useState<Form>(emptyForm);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [maintenanceUntil, setMaintenanceUntil] = useState<Until>(() => untilFrom(null));
  /** ระหว่างเปิดโหมดอยู่: กำลังแก้เวลาปิดเอง */
  const [editingUntil, setEditingUntil] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'maintenance-on' | 'maintenance-off' | 'pages-save' | 'pages-open' | 'notice-auto' } | { kind: 'delete'; notice: Notice } | null>(null);
  // ปิดปรับปรุงเฉพาะหน้า — ค่าที่ติ๊กไว้ (ยังไม่บันทึก) เริ่มจากค่าที่ปิดอยู่จริง
  const [pagePick, setPagePick] = useState<string[]>([]);
  const [pageMessage, setPageMessage] = useState('');
  const [pageUntil, setPageUntil] = useState<Until>(() => untilFrom(null));
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const now = Date.now();
  // นับเวลาที่เหลือของเวลาปิดเอง — วาดใหม่ทุก 30 วินาที
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      const next = await systemService.admin();
      setData(next);
      setPagePick(next.pageMaintenance.pages);
      setPageMessage(next.pageMaintenance.message);
      setPageUntil(untilFrom(next.pageMaintenance.until));
      setMaintenanceUntil(untilFrom(next.maintenance.until));
      setEditingUntil(false);
    } catch { /* 401/403 จัดการโดยระบบ login */ }
  }, []);
  const togglePage = (key: string) => setPagePick(list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]));
  const pagesChanged = Boolean(data) && (
    [...pagePick].sort().join() !== [...(data?.pageMaintenance.pages ?? [])].sort().join()
    || (pagePick.length > 0 && pageMessage !== data?.pageMaintenance.message)
    || (pagePick.length > 0 && untilIso(pageUntil) !== (data?.pageMaintenance.until ?? null))
  );
  useEffect(() => { void load(); }, [load]);

  const fail = (error: unknown, fallback: string) => setNotice({ tone: 'error', text: error instanceof ApiError ? error.message : fallback });
  const done = async (text: string) => {
    setNotice({ tone: 'ok', text });
    await load();
    void refreshSystemStatus(); // แถบประกาศ/แถบแดงบนหน้านี้อัปเดตทันที
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // ติ๊กอัตโนมัติ = บันทึกแล้วระบบจะปิดปรับปรุงเองตามเวลา → ยืนยันอีกรอบ (กันตั้งวัน/เวลาผิด)
    if (form.hasWindow && form.autoMaintenance) setConfirm({ kind: 'notice-auto' });
    else void saveNotice();
  };

  const saveNotice = async () => {
    setSaving(true);
    const input = previewInput(form);
    try {
      if (form.id) await systemService.updateNotice(form.id, input);
      else await systemService.createNotice(input);
      setForm(emptyForm());
      await done(form.id ? 'แก้ไขประกาศแล้ว' : 'บันทึกประกาศแล้ว — จะแสดงบนสุดของทุกหน้าตามช่วงเวลาที่ตั้งไว้');
    } catch (error) {
      fail(error, 'บันทึกประกาศไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const edit = (n: Notice) => {
    const s = new Date(n.startsAt);
    const en = new Date(n.endsAt);
    const blank = emptyForm();
    const ms = n.maintenanceStart ? new Date(n.maintenanceStart) : null;
    const me = n.maintenanceEnd ? new Date(n.maintenanceEnd) : null;
    setForm({
      id: n.id, message: n.message, level: n.level,
      startDate: toIsoDate(s), startTime: timeOf(s), endDate: toIsoDate(en), endTime: timeOf(en),
      hasWindow: Boolean(ms && me),
      mStartDate: ms ? toIsoDate(ms) : blank.mStartDate, mStartTime: ms ? timeOf(ms) : blank.mStartTime,
      mEndDate: me ? toIsoDate(me) : blank.mEndDate, mEndTime: me ? timeOf(me) : blank.mEndTime,
      autoMaintenance: n.autoMaintenance,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const runConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    try {
      if (c.kind === 'notice-auto') {
        await saveNotice();
      } else if (c.kind === 'delete') {
        await systemService.deleteNotice(c.notice.id);
        await done('ลบประกาศแล้ว');
      } else if (c.kind === 'pages-save' || c.kind === 'pages-open') {
        const pages = c.kind === 'pages-open' ? [] : pagePick;
        const until = pages.length ? untilIso(pageUntil) : null;
        await systemService.setPageMaintenance(pages, pageMessage, until);
        await done(pages.length
          ? `ปิดปรับปรุง ${pages.length} หน้าแล้ว — ผู้ใช้เห็นข้อความแจ้งทันที${until ? ` · เปิดกลับเองเวลา ${formatUntil(until)}` : ''}`
          : 'เปิดทุกหน้ากลับแล้ว — ผู้ใช้กลับมาใช้งานได้ทันที');
      } else {
        const on = c.kind === 'maintenance-on';
        const until = on ? untilIso(maintenanceUntil) : null;
        await systemService.setMaintenance(on, maintenanceMessage, until);
        if (!on) setMaintenanceMessage('');
        await done(on
          ? `เปิดโหมดปิดปรับปรุงแล้ว — ผู้ใช้ทั่วไปเห็นหน้าปิดปรับปรุงทันที${until ? ` · ปิดเองเวลา ${formatUntil(until)}` : ''}`
          : 'ปิดโหมดปิดปรับปรุงแล้ว — ผู้ใช้กลับมาใช้งานได้ทันที');
      }
    } catch (error) {
      fail(error, 'ทำรายการไม่สำเร็จ');
    }
  };

  const maintenance = data?.maintenance;

  /** ระหว่างเปิดโหมดเอง: ตั้ง / เลื่อน / ยกเลิกเวลาปิดเอง (ข้อความและเวลาเริ่มคงเดิม) */
  const saveUntil = async () => {
    if (!maintenance) return;
    setSaving(true);
    try {
      const until = untilIso(maintenanceUntil);
      await systemService.setMaintenance(true, maintenance.message, until);
      await done(until ? `ตั้งเวลาปิดโหมดเองเป็น ${formatUntil(until)} แล้ว` : 'ยกเลิกเวลาปิดเองแล้ว — โหมดเปิดค้างจนกว่าจะกดปิด');
    } catch (error) {
      fail(error, 'บันทึกเวลาไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="ประกาศ / ปิดปรับปรุง"
        subtitle={<>แจ้งผู้ใช้ก่อนและระหว่างอัปเดตระบบ · เวอร์ชันปัจจุบัน <b>V {data?.version ?? __APP_VERSION__}</b></>}
      />

      {notice && (
        <div className={`notice-bar${notice.tone === 'error' ? ' error' : ''}`}>
          <i className={`fa-solid ${notice.tone === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check'}`} />
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="ปิด"><i className="fa-solid fa-xmark" /></button>
        </div>
      )}

      {!(data && skeletonDone) ? <PageSkeleton cards={0} rows={[2]} table={5} columns={5} /> : (
        <>
          <section className="system-grid">
            {/* โหมดปิดปรับปรุง */}
            <article className={`card-box system-card maintenance-box${maintenance?.on ? ' is-on' : ''}`}>
              <header>
                <span className="system-card-icon"><i className="fa-solid fa-screwdriver-wrench" /></span>
                <div>
                  <strong>โหมดปิดปรับปรุง</strong>
                  <small>{maintenance?.on
                    ? <>เปิดอยู่ — {maintenance.auto ? <>เปิดอัตโนมัติตามประกาศ #{maintenance.auto}</> : <>โดย {maintenance.by ?? '-'}</>} ตั้งแต่ {formatDateTime(maintenance.since)}</>
                    : 'ปิดอยู่ — ผู้ใช้ทุกคนใช้งานได้ตามปกติ'}</small>
                </div>
                <span className={`maintenance-pill${maintenance?.on ? ' on' : ''}`}>{maintenance?.on ? 'กำลังปิดปรับปรุง' : 'ใช้งานปกติ'}</span>
              </header>
              <p className="system-card-help">
                ระหว่างเปิด: ผู้ใช้ทั่วไปและผู้เยี่ยมชมเห็นหน้า "ระบบปิดปรับปรุงชั่วคราว" · ผู้ดูแลระบบยังใช้งานได้ตามปกติ (ไว้ตรวจระบบหลังอัปเดต)
              </p>
              {maintenance?.on ? (
                <>
                  {maintenance.message && <p className="maintenance-current"><i className="fa-solid fa-quote-left" /> {maintenance.message}</p>}
                  {maintenance.auto === null && (editingUntil ? (
                    <>
                      <UntilField value={maintenanceUntil} onChange={setMaintenanceUntil} label="ปิดโหมดอัตโนมัติเวลา" hint="เอาติ๊กออก = เปิดค้างไว้จนกว่าจะกดปิดเอง" />
                      <div className="notice-form-actions">
                        <button type="button" className="btn-ghost" onClick={() => { setEditingUntil(false); setMaintenanceUntil(untilFrom(maintenance.until)); }}>ยกเลิก</button>
                        <button type="button" className="btn-primary" disabled={saving} onClick={() => void saveUntil()}><i className="fa-solid fa-floppy-disk" /> บันทึกเวลา</button>
                      </div>
                    </>
                  ) : (
                    <p className="until-status">
                      <i className="fa-regular fa-clock" />
                      {maintenance.until
                        ? <span>จะปิดโหมดเองเวลา <b>{formatUntil(maintenance.until)}</b> · {countdown(Date.parse(maintenance.until) - now)}</span>
                        : <span>เปิดค้างไว้ — ไม่ได้ตั้งเวลาปิดเอง</span>}
                      <button type="button" className="btn-link" onClick={() => setEditingUntil(true)}>{maintenance.until ? 'เลื่อนเวลา' : 'ตั้งเวลาปิดเอง'}</button>
                    </p>
                  ))}
                  <button type="button" className="btn-primary" onClick={() => setConfirm({ kind: 'maintenance-off' })}><i className="fa-solid fa-power-off" /> ปิดโหมด — กลับมาใช้งานปกติ</button>
                </>
              ) : (
                <>
                  <label className="system-field">
                    <span>ข้อความถึงผู้ใช้ (ไม่บังคับ)</span>
                    <input value={maintenanceMessage} onChange={e => setMaintenanceMessage(e.target.value)} maxLength={300} placeholder={maintenanceUntil.on ? 'เช่น อัปเดตระบบ — เวลาที่กลับมาใช้ได้แสดงให้ผู้ใช้เห็นเองแล้ว' : 'เช่น ปิดปรับปรุงถึง 18:30 น.'} />
                  </label>
                  <UntilField value={maintenanceUntil} onChange={setMaintenanceUntil} label="ปิดโหมดอัตโนมัติเวลา" hint={'ถึงเวลาแล้วผู้ใช้กลับมาใช้งานได้เอง · งานเสร็จก่อนกด "ปิดโหมด" ได้ · ยังไม่เสร็จกด "เลื่อนเวลา" ได้'} />
                  <button type="button" className="btn-danger" onClick={() => setConfirm({ kind: 'maintenance-on' })}><i className="fa-solid fa-screwdriver-wrench" /> เปิดโหมดปิดปรับปรุง</button>
                </>
              )}
            </article>

            {/* สร้าง / แก้ไขประกาศ */}
            <article className="card-box system-card">
              <header>
                <span className="system-card-icon"><i className="fa-solid fa-bullhorn" /></span>
                <div>
                  <strong>{form.id ? `แก้ไขประกาศ #${form.id}` : 'สร้างประกาศ'}</strong>
                  <small>แสดงเป็นแถบบนสุดของทุกหน้า ตามช่วงเวลาที่ตั้ง — ถึงเวลาสิ้นสุดแล้วหายเอง</small>
                </div>
              </header>
              <form onSubmit={submit} className="notice-form">
                <label className="system-field">
                  <span>{form.hasWindow ? 'ข้อความเพิ่มเติม (ไม่บังคับ)' : 'ข้อความ'} <em>{form.message.length}/500</em></span>
                  <textarea
                    value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} maxLength={500} rows={2} required={!form.hasWindow}
                    placeholder={form.hasWindow ? 'เช่น เพิ่มฟีเจอร์ใหม่ / ปรับปรุงฐานข้อมูล — เวลาปิดปรับปรุงแสดงให้ผู้ใช้เห็นเองแล้ว' : 'เช่น ระบบจะปิดปรับปรุงวันที่ 05/10/2569 เวลา 18:00–18:30 น.'}
                  />
                </label>
                <div className="notice-form-row">
                  <div className="system-field">
                    <span>ระดับ</span>
                    <div className="segmented">
                      {LEVELS.map(l => (
                        <button type="button" key={l.value} className={form.level === l.value ? 'active' : ''} onClick={() => setForm({ ...form, level: l.value })}>
                          <i className={`fa-solid ${l.icon}`} /> {l.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="system-field">
                    <span>เริ่มแสดงประกาศ</span>
                    <div className="datetime-field">
                      <DatePicker value={form.startDate} onChange={startDate => setForm({ ...form, startDate })} />
                      <TimePicker value={form.startTime} onChange={startTime => setForm({ ...form, startTime })} ariaLabel="เวลาเริ่ม" />
                    </div>
                  </div>
                  {/* มีเวลาปิดปรับปรุง → เลิกแสดงประกาศตอนเริ่มปิดปรับปรุง (ไม่ต้องตั้งแยก) */}
                  {form.hasWindow ? (
                    <div className="system-field">
                      <span>เลิกแสดงประกาศ</span>
                      <div className="ends-at-auto"><i className="fa-solid fa-link" /> ตอนเริ่มปิดปรับปรุง</div>
                    </div>
                  ) : (
                    <div className="system-field">
                      <span>เลิกแสดงประกาศ</span>
                      <div className="datetime-field">
                        <DatePicker value={form.endDate} min={form.startDate} onChange={endDate => setForm({ ...form, endDate })} />
                        <TimePicker value={form.endTime} onChange={endTime => setForm({ ...form, endTime })} ariaLabel="เวลาสิ้นสุด" />
                      </div>
                    </div>
                  )}
                </div>
                {/* เวลาปิดปรับปรุงจริง — แยกจากช่วงที่แสดงประกาศ */}
                <div className={`window-box${form.hasWindow ? ' on' : ''}`}>
                  <label className="window-toggle">
                    <input type="checkbox" checked={form.hasWindow} onChange={e => setForm({ ...form, hasWindow: e.target.checked })} />
                    <span><b>ระบุเวลาปิดปรับปรุงจริง</b> — แถบประกาศแสดงเวลานี้พร้อมนับถอยหลัง เตือนซ้ำก่อนถึงเวลา 15 นาที และเลิกแสดงเมื่อเริ่มปิดปรับปรุง</span>
                  </label>
                  {form.hasWindow && (
                    <>
                      <div className="notice-form-row">
                        <div className="system-field">
                          <span>เริ่มปิดปรับปรุง</span>
                          <div className="datetime-field">
                            <DatePicker value={form.mStartDate} onChange={mStartDate => setForm({ ...form, mStartDate })} />
                            <TimePicker value={form.mStartTime} onChange={mStartTime => setForm({ ...form, mStartTime })} ariaLabel="เวลาเริ่มปิดปรับปรุง" />
                          </div>
                        </div>
                        <div className="system-field">
                          <span>ปิดปรับปรุงถึง</span>
                          <div className="datetime-field">
                            <DatePicker value={form.mEndDate} min={form.mStartDate} onChange={mEndDate => setForm({ ...form, mEndDate })} />
                            <TimePicker value={form.mEndTime} onChange={mEndTime => setForm({ ...form, mEndTime })} ariaLabel="เวลาปิดปรับปรุงถึง" />
                          </div>
                        </div>
                      </div>
                      <label className="window-toggle auto">
                        <input type="checkbox" checked={form.autoMaintenance} onChange={e => setForm({ ...form, autoMaintenance: e.target.checked })} />
                        <span>
                          <b>เปิดโหมดปิดปรับปรุงอัตโนมัติเมื่อถึงเวลา</b> และปิดโหมดเองเมื่อหมดเวลา
                          <small>ถ้าอัปเดตเสร็จก่อน กด "ปิดโหมด" ได้เลย (ระบบไม่เปิดซ้ำ) · ถ้าต้องเลื่อนเวลา แก้ประกาศนี้ก่อนถึงเวลาเริ่ม</small>
                        </span>
                      </label>
                    </>
                  )}
                </div>
                {(form.message.trim() || form.hasWindow) && (
                  <div className="notice-preview">
                    <small>ตัวอย่างที่ผู้ใช้จะเห็น{form.level === 'warning' && ' (ระดับเตือน: ขึ้นเป็นหน้าต่างครั้งแรกด้วย)'}</small>
                    <NoticeBar notice={{ id: 0, updatedAt: null, ...previewInput(form) }} now={now} />
                  </div>
                )}
                <div className="notice-form-actions">
                  {form.id && <button type="button" className="btn-ghost" onClick={() => setForm(emptyForm())}>ยกเลิกการแก้ไข</button>}
                  <button type="submit" className="btn-primary" disabled={saving}><i className="fa-solid fa-floppy-disk" /> {form.id ? 'บันทึกการแก้ไข' : 'บันทึกประกาศ'}</button>
                </div>
              </form>
            </article>
          </section>

          {/* ปิดปรับปรุงเฉพาะหน้า */}
          <article className={`card-box system-card page-maint-box${data.pageMaintenance.pages.length ? ' is-on' : ''}`}>
            <header>
              <span className="system-card-icon"><i className="fa-solid fa-table-cells-large" /></span>
              <div>
                <strong>ปิดปรับปรุงเฉพาะหน้า</strong>
                <small>{data.pageMaintenance.pages.length
                  ? <>ปิดอยู่ {data.pageMaintenance.pages.length} หน้า — โดย {data.pageMaintenance.by ?? '-'} ตั้งแต่ {formatDateTime(data.pageMaintenance.since)}</>
                  : 'ทุกหน้าเปิดใช้งานตามปกติ'}</small>
              </div>
              <span className={`maintenance-pill${data.pageMaintenance.pages.length ? ' on' : ''}`}>
                {data.pageMaintenance.pages.length ? `ปิด ${data.pageMaintenance.pages.length} หน้า` : 'ใช้งานปกติ'}
              </span>
            </header>
            <p className="system-card-help">
              ติ๊กหน้าที่จะปิด แล้วกดบันทึก — ผู้ใช้ทั่วไปที่เปิดหน้านั้นจะเห็นข้อความ "หน้านี้กำลังปรับปรุงชั่วคราว" (เมนูมีไอคอน 🔧) ส่วนหน้าอื่นใช้งานได้ตามปกติ · ผู้ดูแลระบบยังเปิดดูได้
            </p>
            <div className="page-picker">
              {pageOptions(data.maintainablePages).map(p => (
                <label key={p.key} className={`page-chip${pagePick.includes(p.key) ? ' checked' : ''}`}>
                  <input type="checkbox" checked={pagePick.includes(p.key)} onChange={() => togglePage(p.key)} />
                  <i className={`fa-solid ${p.icon}`} /> {p.label}
                </label>
              ))}
            </div>
            <label className="system-field">
              <span>ข้อความถึงผู้ใช้ (ไม่บังคับ)</span>
              <input value={pageMessage} onChange={e => setPageMessage(e.target.value)} maxLength={300} placeholder={pageUntil.on ? 'เช่น กำลังปรับปรุงข้อมูล — เวลาที่กลับมาใช้ได้แสดงให้ผู้ใช้เห็นเองแล้ว' : 'เช่น กำลังปรับปรุงข้อมูล ถึง 16:00 น.'} />
            </label>
            {pagePick.length > 0 && (
              <UntilField value={pageUntil} onChange={setPageUntil} label="เปิดหน้ากลับอัตโนมัติเวลา" hint="ถึงเวลาแล้วทุกหน้าที่ปิดไว้กลับมาใช้งานได้เอง · แก้เวลาแล้วกดบันทึกอีกครั้ง" />
            )}
            {data.pageMaintenance.pages.length > 0 && data.pageMaintenance.until && (
              <p className="until-status"><i className="fa-regular fa-clock" /><span>จะเปิดทุกหน้ากลับเองเวลา <b>{formatUntil(data.pageMaintenance.until)}</b> · {countdown(Date.parse(data.pageMaintenance.until) - now)}</span></p>
            )}
            <div className="notice-form-actions">
              {data.pageMaintenance.pages.length > 0 && (
                <button type="button" className="btn-ghost" onClick={() => setConfirm({ kind: 'pages-open' })}><i className="fa-solid fa-lock-open" /> เปิดทุกหน้ากลับ</button>
              )}
              <button type="button" className="btn-primary" disabled={!pagesChanged} onClick={() => setConfirm({ kind: 'pages-save' })}>
                <i className="fa-solid fa-floppy-disk" /> บันทึก{pagePick.length ? ` (ปิด ${pagePick.length} หน้า)` : ''}
              </button>
            </div>
          </article>

          {/* รีสตาร์ทระบบ */}
          <RestartCard
            restart={data.restart}
            liveClients={data.liveClients}
            onDone={async () => { await load(); setNotice({ tone: 'ok', text: 'รีสตาร์ทระบบเสร็จแล้ว — กลับมาใช้งานได้ตามปกติ' }); }}
            onError={text => setNotice({ tone: 'error', text })}
          />

          {/* รายการประกาศ */}
          <article className="card-box table-card">
            <div className="table-responsive">
              <table className="rank-table notices-table">
                <thead><tr><th>สถานะ</th><th>ข้อความ</th><th>ระดับ</th><th>ช่วงที่แสดงประกาศ</th><th>ปิดปรับปรุงจริง</th><th>สร้างโดย</th><th aria-label="จัดการ" /></tr></thead>
                <tbody>
                  {data.notices.map(n => {
                    const st = stateOf(n, now);
                    return (
                      <tr key={n.id} className={st.key === 'ended' ? 'is-ended' : undefined}>
                        <td className="nowrap"><span className={`notice-state state-${st.key}`}>{st.label}</span></td>
                        <td>{n.message || <span className="muted">(ไม่มีข้อความ — แสดงเวลาปิดปรับปรุง)</span>}</td>
                        <td className="nowrap">{LEVELS.find(l => l.value === n.level)?.label}</td>
                        <td className="nowrap">{formatDateTime(n.startsAt)}<br /><small className="muted">ถึง {formatDateTime(n.endsAt)}</small></td>
                        <td className="nowrap">
                          {n.maintenanceStart && n.maintenanceEnd ? (
                            <>
                              {formatWindow(n.maintenanceStart, n.maintenanceEnd)}
                              {n.autoMaintenance && (
                                <><br /><span className="auto-badge"><i className="fa-solid fa-robot" /> อัตโนมัติ{n.autoStartedAt && ' · เปิดโหมดแล้ว'}</span></>
                              )}
                            </>
                          ) : <span className="muted">–</span>}
                        </td>
                        <td className="nowrap"><code className="icd-code">{n.createdBy}</code></td>
                        <td className="nowrap">
                          <button type="button" className="icon-btn" onClick={() => edit(n)} data-tip="แก้ไข"><i className="fa-solid fa-pen" /></button>
                          <button type="button" className="icon-btn danger" onClick={() => setConfirm({ kind: 'delete', notice: n })} data-tip="ลบ"><i className="fa-solid fa-trash" /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {data.notices.length === 0 && <tr><td colSpan={7} className="empty">ยังไม่มีประกาศ</td></tr>}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}

      <ConfirmDialog
        open={confirm !== null}
        icon={confirm?.kind === 'delete' ? 'fa-trash' : confirm?.kind === 'notice-auto' ? 'fa-robot' : 'fa-screwdriver-wrench'}
        title={confirm?.kind === 'delete' ? 'ลบประกาศนี้?'
          : confirm?.kind === 'notice-auto' ? (form.id ? `บันทึกการแก้ไขประกาศ #${form.id}?` : 'บันทึกประกาศ + ปิดปรับปรุงอัตโนมัติ?')
          : confirm?.kind === 'maintenance-on' ? 'เปิดโหมดปิดปรับปรุง?'
            : confirm?.kind === 'maintenance-off' ? 'ปิดโหมดปิดปรับปรุง?'
              : confirm?.kind === 'pages-open' || pagePick.length === 0 ? 'เปิดทุกหน้ากลับ?' : `ปิดปรับปรุง ${pagePick.length} หน้า?`}
        message={confirm?.kind === 'delete'
          ? `${confirm.notice.message ? `"${confirm.notice.message.slice(0, 80)}"` : `ประกาศ #${confirm.notice.id}`} จะหายจากหน้าเว็บทันที`
          : confirm?.kind === 'notice-auto'
            ? `แสดงประกาศให้ผู้ใช้ทุกคนเห็นตั้งแต่ ${formatDateTime(combine(form.startDate, form.startTime))} น. · ⚠️ ระบบจะปิดปรับปรุงเอง ${formatWindow(combine(form.mStartDate, form.mStartTime), combine(form.mEndDate, form.mEndTime))} — ผู้ใช้ทั่วไปและผู้เยี่ยมชมเข้าเว็บไม่ได้ช่วงนี้ (ผู้ดูแลยังใช้งานได้) · กรุณาตรวจวันและเวลาให้ถูกต้อง`
          : confirm?.kind === 'maintenance-on'
            ? (maintenanceUntil.on
              ? `ผู้ใช้ทั่วไปและผู้เยี่ยมชมจะใช้งานไม่ได้ (เห็นหน้าปิดปรับปรุง) จนถึง ${formatUntil(combine(maintenanceUntil.date, maintenanceUntil.time))} แล้วระบบปิดโหมดให้เอง — ผู้ดูแลระบบยังใช้งานได้`
              : 'ผู้ใช้ทั่วไปและผู้เยี่ยมชมจะใช้งานไม่ได้ (เห็นหน้าปิดปรับปรุง) จนกว่าจะปิดโหมด — ผู้ดูแลระบบยังใช้งานได้')
            : confirm?.kind === 'maintenance-off'
              ? 'ผู้ใช้ทุกคนจะกลับมาใช้งานได้ตามปกติ'
              : confirm?.kind === 'pages-open' || pagePick.length === 0
                ? 'ทุกหน้าจะกลับมาใช้งานได้ตามปกติ'
                : `ผู้ใช้ทั่วไปจะเปิดหน้าเหล่านี้ไม่ได้: ${pageOptions(data?.maintainablePages ?? []).filter(p => pagePick.includes(p.key)).map(p => p.label).join(', ')} — หน้าอื่นใช้งานได้ตามปกติ${pageUntil.on ? ` · เปิดกลับเองเวลา ${formatUntil(combine(pageUntil.date, pageUntil.time))}` : ''}`}
        confirmLabel={confirm?.kind === 'delete' ? 'ลบ' : confirm?.kind === 'notice-auto' ? 'ยืนยัน บันทึก' : confirm?.kind === 'maintenance-on' ? 'เปิดโหมด' : confirm?.kind === 'maintenance-off' ? 'ปิดโหมด' : 'ยืนยัน'}
        tone={confirm?.kind === 'maintenance-off' || confirm?.kind === 'pages-open' || (confirm?.kind === 'pages-save' && pagePick.length === 0) ? 'primary' : 'danger'}
        onConfirm={() => void runConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
