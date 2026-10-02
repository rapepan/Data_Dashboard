/** เลขเวอร์ชัน server ใหม่กว่าของหน้าเว็บที่เปิดอยู่ไหม — เทียบทีละหลัก (0.10.0 ใหม่กว่า 0.9.0) */
export function isNewerVersion(server: string, client: string) {
  const a = server.split('.').map(Number);
  const b = client.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}
