import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

// เลขเวอร์ชันระบบ — จุดเดียวคือ package.json ที่โฟลเดอร์หลัก (backend อ่านไฟล์เดียวกัน · หน้าเว็บเทียบกันเพื่อแจ้งว่ามีเวอร์ชันใหม่)
const appVersion = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version

// ส่ง /api ต่อไปที่ backend — ให้ frontend กับ API อยู่ origin เดียวกัน cookie login จึงใช้ได้
// xfwd: แนบ IP เครื่องผู้ใช้ (X-Forwarded-For) ให้ backend — backend เชื่อเฉพาะที่มาจากเครื่องตัวเอง (trustProxy)
const apiProxy = {
  '/api': { target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:4000', changeOrigin: false, xfwd: true },
}

// Content-Security-Policy ของหน้าเว็บ — ทุกอย่างมาจากเว็บเราเอง (ไม่มี CDN) · ต้องตรงกับใน deploy/nginx/bsth-dashboard.conf
// style 'unsafe-inline': ไลบรารี UI ใส่ style ในแท็กเอง · img data:/blob: = รูปตัวอย่างก่อนแนบ / QR · font data: = ฟอนต์ไอคอนบางตัว
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  server: { proxy: apiProxy },
  build: {
    rolldownOptions: {
      output: {
        // ไลบรารีแยกไฟล์จากโค้ดของระบบ — อัปเดตระบบแล้วเบราว์เซอร์โหลดใหม่เฉพาะโค้ดระบบ ไลบรารีใช้ของที่จำไว้
        // (exceljs ไม่รวม — โหลดเฉพาะตอนกดส่งออก Excel)
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/, priority: 30 },
            { name: 'vendor-chart', test: /node_modules[\\/](chart\.js|react-chartjs-2|@kurkle)[\\/]/, priority: 20 },
            { name: 'vendor', test: /node_modules[\\/](?!exceljs[\\/])/, priority: 10 },
          ],
        },
      },
    },
  },
  // npm run preview = ทดสอบไฟล์ที่ build แล้วด้วย CSP เดียวกับเครื่องจริง (deploy/nginx/bsth-dashboard.conf)
  preview: { proxy: apiProxy, headers: { 'Content-Security-Policy': CSP } },
})
