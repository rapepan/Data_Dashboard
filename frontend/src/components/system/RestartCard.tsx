import { useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import { markRestarting, check as refreshSystemStatus } from '../../hooks/useSystemStatus';
import { ApiError } from '../../services/apiClient';
import { systemService, type AdminSystem } from '../../services/systemService';

type Stage = 'closing' | 'starting' | 'done' | 'slow';

/** เกินเวลานี้ยังไม่กลับ → แนะนำดู log บนเครื่อง (ยังรอต่อจนครบ GIVE_UP_MS) */
const SLOW_MS = 60_000;
const GIVE_UP_MS = 5 * 60_000;
const POLL_MS = 1_500;

const pad = (n: number) => String(n).padStart(2, '0');
/** "07/10/2569 08:30" */
function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ทำงานมาแล้วนานเท่าไร */
function uptime(ms: number) {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'ไม่ถึง 1 นาที';
  if (min < 60) return `${min} นาที`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ชม.${min % 60 ? ` ${min % 60} นาที` : ''}`;
  return `${Math.floor(h / 24)} วัน${h % 24 ? ` ${h % 24} ชม.` : ''}`;
}

const seconds = (from: string, to: string) => Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 1000));

const STEPS: { key: Stage; label: string }[] = [
  { key: 'closing', label: 'ปิดระบบแบบนุ่มนวล (ปิดช่องสัญญาณสด / บันทึกสถานะ / ปิดการเชื่อมต่อฐาน)' },
  { key: 'starting', label: 'systemd เปิดระบบใหม่' },
  { key: 'done', label: 'พร้อมใช้งาน' },
];

interface RestartCardProps {
  restart: AdminSystem['restart'];
  liveClients: number;
  /** รีสตาร์ทเสร็จ → โหลดข้อมูลหน้าใหม่ */
  onDone: () => Promise<void> | void;
  onError: (message: string) => void;
}

/**
 * รีสตาร์ท backend จากหน้าผู้ดูแล — backend ปิดตัวเองแบบนุ่มนวลแล้ว systemd เปิดใหม่
 * ระหว่างรอ ตรวจทุก 1.5 วินาทีว่าตัวใหม่ขึ้นมาหรือยัง (เวลาเริ่มทำงานเปลี่ยน = ตัวใหม่)
 */
export default function RestartCard({ restart, liveClients, onDone, onError }: RestartCardProps) {
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const [tookSec, setTookSec] = useState(0);
  const alive = useRef(true);
  // ตั้งกลับเป็น true ทุกครั้งที่ mount (StrictMode รัน mount → cleanup → mount)
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  // นับเวลาทำงานใหม่ทุก 1 นาที
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const busy = stage === 'closing' || stage === 'starting' || stage === 'slow';

  const run = async () => {
    setAsking(false);
    const before = restart.startedAt;
    const t0 = Date.now();
    setStage('closing');
    try {
      await systemService.restart(reason.trim());
    } catch (error) {
      setStage(null);
      onError(error instanceof ApiError ? error.message : 'สั่งรีสตาร์ทไม่สำเร็จ — เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
      return;
    }
    markRestarting();
    setReason('');
    while (alive.current && Date.now() - t0 < GIVE_UP_MS) {
      await new Promise(resolve => window.setTimeout(resolve, POLL_MS));
      if (!alive.current) return;
      try {
        const next = await systemService.adminSilent();
        if (next.restart.startedAt !== before) {
          setTookSec(Math.max(1, Math.round((Date.now() - t0) / 1000)));
          setStage('done');
          void refreshSystemStatus();
          await onDone();
          return;
        }
      } catch {
        // ตัวเก่าปิดแล้ว ตัวใหม่ยังไม่ขึ้น
        setStage(s => (s === 'closing' ? 'starting' : s));
      }
      if (Date.now() - t0 > SLOW_MS) setStage('slow');
    }
  };

  const stepState = (key: Stage) => {
    const order = ['closing', 'starting', 'done'];
    const current = stage === 'slow' ? 'starting' : stage;
    if (!current) return 'todo';
    const i = order.indexOf(key);
    const c = order.indexOf(current);
    if (stage === 'done' || i < c) return 'done';
    return i === c ? (stage === 'slow' ? 'slow' : 'active') : 'todo';
  };

  const last = restart.last;

  return (
    <article className={`card-box system-card restart-box${busy ? ' is-on' : ''}`}>
      <header>
        <span className="system-card-icon"><i className="fa-solid fa-rotate-right" /></span>
        <div>
          <strong>รีสตาร์ทระบบ</strong>
          <small>เริ่มทำงานล่าสุด {formatDateTime(restart.startedAt)} น. · ทำงานมาแล้ว {uptime(now - Date.parse(restart.startedAt))}</small>
        </div>
        <span className={`maintenance-pill${restart.supported ? '' : ' off'}`}>{restart.supported ? 'พร้อมใช้' : 'ใช้ไม่ได้บนเครื่องนี้'}</span>
      </header>
      <p className="system-card-help">
        ปิดระบบ (backend) แบบนุ่มนวลแล้วเปิดใหม่ ใช้เวลาประมาณ 5–10 วินาที — ใช้เมื่อระบบค้าง/ช้าผิดปกติ หรือหลังแก้ค่าในไฟล์ .env ·
        ผู้ใช้ไม่หลุด login · ผลรายงานที่พักไว้ยังอยู่ · แจ้ง Telegram ผู้ดูแลทั้งตอนสั่งและตอนระบบกลับมา
      </p>
      {last && (
        <p className="until-status">
          <i className="fa-solid fa-clock-rotate-left" />
          <span>
            ครั้งล่าสุด {formatDateTime(last.requestedAt)} น. โดย <b>{last.name || last.by}</b>
            {last.reason && <> · {last.reason}</>}
            {last.backAt && <> · กลับมาใน {seconds(last.requestedAt, last.backAt)} วินาที</>}
          </span>
        </p>
      )}
      {!restart.supported && (
        <div className="notice-bar">
          <i className="fa-solid fa-circle-info" />
          <span>
            ใช้ได้เมื่อรันด้วย systemd บนเครื่องจริงเท่านั้น — เครื่องนี้ (npm run dev) ไม่มีตัวเปิดระบบกลับ ถ้าปิดแล้วระบบจะดับไปเลย ·
            บนเครื่องจริงสั่งทางคำสั่งได้ด้วย <code>bash deploy/scripts/restart.sh</code>
          </span>
        </div>
      )}
      {stage && (
        <ol className="restart-steps" aria-live="polite">
          {STEPS.map(step => {
            const st = stepState(step.key);
            return (
              <li key={step.key} className={`is-${st}`}>
                <i className={`fa-solid ${st === 'done' ? 'fa-circle-check' : st === 'active' ? 'fa-spinner fa-spin' : st === 'slow' ? 'fa-triangle-exclamation' : 'fa-circle'}`} />
                <span>
                  {step.key === 'done' && stage === 'done' ? <>พร้อมใช้งาน (ใช้เวลา {tookSec} วินาที)</> : step.label}
                  {st === 'slow' && <small>เกิน 1 นาทียังไม่กลับ — ตรวจที่เครื่อง: <code>journalctl -u bsth-dashboard -n 50</code> (หน้านี้ยังรอต่อให้)</small>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <label className="system-field">
        <span>เหตุผล (ไม่บังคับ) — ส่งไปกับการแจ้ง Telegram และบันทึกในประวัติการใช้งาน</span>
        <input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} disabled={!restart.supported || busy} placeholder="เช่น แก้ค่าใน .env / ระบบช้าผิดปกติ" />
      </label>
      <button type="button" className="btn-danger" disabled={!restart.supported || busy} onClick={() => setAsking(true)}>
        <i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} /> {busy ? 'กำลังรีสตาร์ท...' : 'รีสตาร์ทระบบ'}
      </button>

      <ConfirmDialog
        open={asking}
        icon="fa-rotate-right"
        title="รีสตาร์ทระบบ?"
        message={`ระบบจะปิดแล้วเปิดใหม่ประมาณ 5–10 วินาที · หน้าเว็บที่เปิดอยู่ตอนนี้ ${liveClients.toLocaleString('en-US')} เครื่องจะเห็นแถบ "ระบบกำลังเริ่มใหม่" แล้วใช้งานต่อได้เอง ไม่มีใครหลุด login${reason.trim() ? ` · เหตุผล: ${reason.trim()}` : ''}`}
        confirmLabel="รีสตาร์ท"
        tone="danger"
        onConfirm={() => void run()}
        onCancel={() => setAsking(false)}
      />
    </article>
  );
}
