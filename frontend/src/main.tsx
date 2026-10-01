import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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
