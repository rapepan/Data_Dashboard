import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// ส่ง /api ต่อไปที่ backend — ให้ frontend กับ API อยู่ origin เดียวกัน cookie login จึงใช้ได้
// xfwd: แนบ IP เครื่องผู้ใช้ (X-Forwarded-For) ให้ backend — backend เชื่อเฉพาะที่มาจากเครื่องตัวเอง (trustProxy)
const apiProxy = {
  '/api': { target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:4000', changeOrigin: false, xfwd: true },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
})
