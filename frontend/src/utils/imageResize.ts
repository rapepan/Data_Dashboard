/**
 * ย่อรูปในเบราว์เซอร์ก่อนส่ง — ด้านยาวไม่เกิน MAX_SIDE และแปลงเป็น JPEG
 * ได้ไฟล์เล็กลงมาก (ส่งเร็วแม้เน็ตช้า) และข้อมูลแฝงในรูป (เช่น พิกัด GPS จากมือถือ) หายไปด้วย
 */
const MAX_SIDE = 1920;
const QUALITY = 0.85;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class ImageAttachError extends Error {}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageAttachError('อ่านไฟล์รูปไม่ได้'));
    reader.readAsDataURL(blob);
  });
}

export async function resizeImage(file: Blob): Promise<{ dataUrl: string; size: number }> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new ImageAttachError('แนบได้เฉพาะรูป JPG, PNG หรือ WebP');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageAttachError('ไฟล์รูปเสียหรือเปิดไม่ได้');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageAttachError('เบราว์เซอร์นี้ย่อรูปไม่ได้');
  // พื้นขาว (ภาพ PNG โปร่งใสจะไม่กลายเป็นพื้นดำตอนแปลงเป็น JPEG)
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new ImageAttachError('ย่อรูปไม่สำเร็จ');
  if (blob.size > MAX_IMAGE_BYTES) throw new ImageAttachError('รูปใหญ่เกิน 5 MB');
  return { dataUrl: await blobToDataUrl(blob), size: blob.size };
}
