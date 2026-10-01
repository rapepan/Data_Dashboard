import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ACCEPTED_TYPES, ImageAttachError, resizeImage } from '../utils/imageResize';

export interface AttachedImage {
  id: number;
  dataUrl: string;
  size: number;
}

interface ImageAttachProps {
  images: AttachedImage[];
  onChange: (images: AttachedImage[]) => void;
  max?: number;
}

let nextId = 1;
const kb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function ImageAttach({ images, onChange, max = 3 }: ImageAttachProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ images, onChange });
  useEffect(() => { latest.current = { images, onChange }; });

  const add = async (files: Blob[]) => {
    const current = latest.current.images;
    const room = max - current.length;
    const picked = files.filter(f => f.type.startsWith('image/'));
    if (picked.length === 0) { setError('แนบได้เฉพาะไฟล์รูปภาพ'); return; }
    if (room <= 0) { setError(`แนบได้สูงสุด ${max} รูป`); return; }
    setError(picked.length > room ? `แนบได้สูงสุด ${max} รูป — เพิ่มได้อีก ${room} รูป` : null);
    setBusy(true);
    const added: AttachedImage[] = [];
    for (const file of picked.slice(0, room)) {
      try {
        const { dataUrl, size } = await resizeImage(file);
        added.push({ id: nextId++, dataUrl, size });
      } catch (err) {
        setError(err instanceof ImageAttachError ? err.message : 'แนบรูปไม่สำเร็จ');
      }
    }
    setBusy(false);
    if (added.length) latest.current.onChange([...latest.current.images, ...added]);
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.items ?? [])].filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((f): f is File => f !== null);
      if (files.length === 0) return;
      e.preventDefault();
      void add(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void add([...e.dataTransfer.files]);
  };

  const full = images.length >= max;

  return (
    <div className="contact-field">
      <span className="contact-label">แนบรูปภาพ <small>(สูงสุด {max} รูป)</small></span>
      <div
        className={`attach-box${dragging ? ' dragging' : ''}${full ? ' full' : ''}`}
        onDragOver={e => { e.preventDefault(); if (!full) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {!full && (
          <button type="button" className="attach-pick" onClick={() => inputRef.current?.click()} disabled={busy}>
            <i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-paperclip'}`} />
            <span>{busy ? 'กำลังเตรียมรูป...' : <><b>คลิกเพื่อเลือกรูป</b> · ลากรูปมาวาง · หรือกด <kbd>Ctrl</kbd>+<kbd>V</kbd> วางภาพหน้าจอ</>}</span>
          </button>
        )}
        {images.length > 0 && (
          <div className="attach-list">
            {images.map((img, i) => (
              <figure key={img.id} className="attach-item">
                <img src={img.dataUrl} alt={`รูปแนบ ${i + 1}`} />
                <figcaption>{kb(img.size)}</figcaption>
                <button type="button" onClick={() => onChange(images.filter(x => x.id !== img.id))} aria-label={`ลบรูปที่ ${i + 1}`} data-tip="ลบรูปนี้">
                  <i className="fa-solid fa-xmark" />
                </button>
              </figure>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          hidden
          onChange={e => { void add([...(e.target.files ?? [])]); e.target.value = ''; }}
        />
      </div>
      {error && <small className="attach-error"><i className="fa-solid fa-circle-exclamation" /> {error}</small>}
    </div>
  );
}
