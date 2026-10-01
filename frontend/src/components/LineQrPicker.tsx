import { useRef, useState } from 'react';
import { ACCEPTED_TYPES, ImageAttachError, resizeImage } from '../utils/imageResize';

/** เลือกรูป QR Code LINE 1 รูป (ย่อรูปก่อนส่งแบบเดียวกับรูปแนบ) — value = data URL หรือ null */
export default function LineQrPicker({ value, onChange }: { value: string | null; onChange: (dataUrl: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onChange((await resizeImage(file)).dataUrl);
    } catch (err) {
      setError(err instanceof ImageAttachError ? err.message : 'เปิดรูปไม่ได้ กรุณาลองรูปอื่น');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="line-qr-picker">
      <input ref={inputRef} type="file" accept={ACCEPTED_TYPES.join(',')} hidden onChange={e => { void pick(e.target.files?.[0]); }} />
      {value ? (
        <div className="line-qr-preview">
          <img src={value} alt="QR Code LINE ที่แนบ" />
          <div>
            <span><i className="fa-solid fa-circle-check" /> แนบ QR Code แล้ว</span>
            <div className="line-qr-actions">
              <button type="button" className="btn-outline" onClick={() => inputRef.current?.click()}><i className="fa-solid fa-arrows-rotate" /> เปลี่ยนรูป</button>
              <button type="button" className="btn-outline danger" onClick={() => onChange(null)}><i className="fa-solid fa-trash-can" /> ลบ</button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className="line-qr-drop" onClick={() => inputRef.current?.click()} disabled={busy}>
          <i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-qrcode'}`} />
          <span>{busy ? 'กำลังเตรียมรูป...' : 'เลือกรูป QR Code LINE'}</span>
          <small>LINE › เพิ่มเพื่อน › QR Code › บันทึกรูป แล้วเลือกรูปนั้น</small>
        </button>
      )}
      {error && <small className="line-qr-error"><i className="fa-solid fa-circle-exclamation" /> {error}</small>}
    </div>
  );
}
