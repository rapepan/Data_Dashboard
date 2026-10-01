import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import AppRoutes from './routes/AppRoutes';
import DemoNotice from './components/DemoNotice';
import GlobalTooltip from './components/GlobalTooltip';
import Toaster from './components/Toaster';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        {/* ชั่วคราว: แจ้งว่าเป็นข้อมูลจำลอง — เอาออกเมื่อใช้ข้อมูลจริง */}
        <DemoNotice />
        <GlobalTooltip />
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}
