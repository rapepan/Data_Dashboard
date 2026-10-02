import { Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import AppFooter from './AppFooter';
import { useAuth } from '../auth/AuthContext';
import SystemLayer from './system/SystemLayer';
import PageSkeleton from './PageSkeleton';

const COLLAPSED_KEY = 'sidebar-collapsed';

function readCollapsed() {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // จำสถานะย่อ/ขยายไว้ เปิดหน้าใหม่ครั้งหน้าจะเป็นแบบเดิม
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { notice, dismissNotice } = useAuth();

  // จอเล็ก = เปิด/ปิด drawer, จอใหญ่ = ย่อเหลือไอคอน/ขยาย sidebar
  const toggleSidebar = () => {
    if (window.matchMedia('(max-width: 991px)').matches) {
      setSidebarOpen(open => !open);
      return;
    }
    setCollapsed(value => {
      try { localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1'); } catch { /* ไม่มี storage ก็ไม่เป็นไร */ }
      return !value;
    });
  };

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar open={sidebarOpen} collapsed={collapsed} onClose={() => setSidebarOpen(false)} />
      <main className="main-area">
        <Topbar onMenuClick={toggleSidebar} />
        <div className="page-content">
          <SystemLayer />
          {notice && (
            <div className="notice-bar" role="status">
              <i className="fa-solid fa-circle-info" />
              <span>{notice}</span>
              <button onClick={dismissNotice} aria-label="ปิด"><i className="fa-solid fa-xmark" /></button>
            </div>
          )}
          {/* หน้าที่แยกไฟล์ (lazy) ระหว่างโหลดครั้งแรก */}
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
        <AppFooter />
      </main>
    </div>
  );
}
