import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// CSS / ไอคอน / ฟอนต์ รวมไว้ในระบบเอง (เดิมโหลดจาก CDN) — เครื่องผู้ใช้ไม่ต้องออกอินเทอร์เน็ตก็แสดงครบ
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fontsource/ibm-plex-sans-thai/400.css';
import '@fontsource/ibm-plex-sans-thai/500.css';
import '@fontsource/ibm-plex-sans-thai/600.css';
import '@fontsource/ibm-plex-sans-thai/700.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles/app.css';
import App from './App.tsx';
import { installErrorReporter, reportClientError } from './utils/errorReporter';

// error ในเบราว์เซอร์ผู้ใช้ → แจ้ง backend ให้เห็นในเทอร์มินัล
installErrorReporter();

createRoot(document.getElementById('root')!, {
  // React render พัง (หน้าขาว) — ส่งไปให้ backend แล้วแสดงใน console ตามปกติ
  onUncaughtError: (error) => {
    reportClientError(error);
    console.error(error);
  },
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
