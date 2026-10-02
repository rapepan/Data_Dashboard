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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
})
