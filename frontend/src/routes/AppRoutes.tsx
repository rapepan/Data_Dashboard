import { lazy, useEffect, type ComponentType, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageGuard } from '../auth/guards';
import { useAuth } from '../auth/AuthContext';
import LoginPage from '../pages/LoginPage';
import DashboardPage from '../pages/DashboardPage';

/*
 * หน้าอื่นนอกจากหน้าแรกแยกไฟล์ (เปิดเว็บครั้งแรกเร็วขึ้น) แล้วทยอยโหลดเก็บไว้เบื้องหลังหลังหน้าแรกแสดงเสร็จ
 * → เปลี่ยนหน้าไม่ต้องรอโหลดโค้ด เหลือรอแค่ข้อมูล (สำคัญเมื่อเข้าผ่านเครือข่ายที่หน่วง เช่น Forward port / เน็ตนอกโรงพยาบาล)
 * หน้าผู้ดูแลโหลดล่วงหน้าเฉพาะผู้ดูแล
 */
const loaders: { load: () => Promise<unknown>; admin: boolean }[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- รับหน้าที่มี props ได้ (เช่น PlaceholderPage)
function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>, admin = false) {
  loaders.push({ load, admin });
  return lazy(load);
}
let preloaded = { user: false, admin: false };
function preloadPages(isAdmin: boolean) {
  const todo = loaders.filter(l => (l.admin ? isAdmin && !preloaded.admin : !preloaded.user));
  preloaded = { user: true, admin: preloaded.admin || isAdmin };
  // ทีละ 3 หน้า — ไม่แย่งเครือข่ายกับข้อมูลของหน้าที่กำลังเปิด
  const queue = [...todo];
  const next = (): Promise<void> => {
    const item = queue.shift();
    return item ? item.load().catch(() => undefined).then(next) : Promise.resolve();
  };
  void Promise.all([next(), next(), next()]);
}
const OpdPage = lazyPage(() => import('../pages/OpdPage'));
const IpdPage = lazyPage(() => import('../pages/IpdPage'));
const ErPage = lazyPage(() => import('../pages/ErPage'));
const QueuePage = lazyPage(() => import('../pages/QueuePage'));
const Icd10SearchPage = lazyPage(() => import('../pages/Icd10SearchPage'));
const DentalPage = lazyPage(() => import('../pages/DentalPage'));
const PhysioPage = lazyPage(() => import('../pages/PhysioPage'));
const TelemedicinePage = lazyPage(() => import('../pages/TelemedicinePage'));
const ThaiMedicinePage = lazyPage(() => import('../pages/ThaiMedicinePage'));
const ReadmitPage = lazyPage(() => import('../pages/ReadmitPage'));
const ReferralPage = lazyPage(() => import('../pages/ReferralPage'));
const DrugBudgetPage = lazyPage(() => import('../pages/DrugBudgetPage'));
const AuditLogPage = lazyPage(() => import('../pages/admin/AuditLogPage'), true);
const UsagePage = lazyPage(() => import('../pages/admin/UsagePage'), true);
const FeedbackPage = lazyPage(() => import('../pages/admin/FeedbackPage'), true);
const DataStatusPage = lazyPage(() => import('../pages/admin/DataStatusPage'), true);
const UsersPage = lazyPage(() => import('../pages/admin/UsersPage'), true);
const SystemPage = lazyPage(() => import('../pages/admin/SystemPage'), true);
const ContactPage = lazyPage(() => import('../pages/ContactPage'));
const PostalDrugPage = lazyPage(() => import('../pages/PostalDrugPage'));
const PlaceholderPage = lazyPage(() => import('../pages/PlaceholderPage'));
const MyFeedbackPage = lazyPage(() => import('../pages/MyFeedbackPage'));

const guard = (page: string, element: ReactNode) => <PageGuard page={page}>{element}</PageGuard>;

export default function AppRoutes() {
  const { status, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  useEffect(() => {
    if (status !== 'ready') return;
    // รอให้หน้าแรกโหลดข้อมูลเสร็จก่อน แล้วค่อยโหลดหน้าอื่นตอนเบราว์เซอร์ว่าง
    const id = window.setTimeout(() => {
      const run = () => preloadPages(isAdmin);
      if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 }); else run();
    }, 1500);
    return () => window.clearTimeout(id);
  }, [status, isAdmin]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={guard('dashboard', <DashboardPage />)} />
        <Route path="/icd10-search" element={guard('icd10', <Icd10SearchPage />)} />
        <Route path="/queue" element={guard('queue', <QueuePage />)} />
        <Route path="/opd" element={guard('opd', <OpdPage />)} />
        <Route path="/ipd" element={guard('ipd', <IpdPage />)} />
        <Route path="/er" element={guard('er', <ErPage />)} />
        <Route path="/stroke-unit" element={<Navigate to="/" replace />} />
        <Route path="/dental" element={guard('dental', <DentalPage />)} />
        <Route path="/physio" element={guard('physio', <PhysioPage />)} />
        <Route path="/telemedicine" element={guard('tele', <TelemedicinePage />)} />
        <Route path="/telepharmacy" element={guard('tele', <PlaceholderPage title="Telepharmacy (เภสัชกรรมทางไกล)" icon="fa-display" description="หน้านี้กำลังพัฒนา — จะแสดงสถิติบริการเภสัชกรรมทางไกลเมื่อพร้อม" />)} />
        {/* ชื่อเดิม — ลิงก์ที่บันทึกไว้ยังใช้ได้ */}
        <Route path="/teleframe" element={<Navigate to="/telepharmacy" replace />} />
        <Route path="/postal-drug" element={guard('postal', <PostalDrugPage />)} />
        <Route path="/thai-medicine" element={guard('thaimed', <ThaiMedicinePage />)} />
        <Route path="/readmit" element={guard('readmit', <ReadmitPage />)} />
        <Route path="/referral" element={guard('referral', <ReferralPage />)} />
        <Route path="/drug-budget" element={guard('drugbudget', <DrugBudgetPage />)} />
        <Route path="/contact" element={guard('contact', <ContactPage />)} />
        <Route path="/my-feedback" element={guard('myfeedback', <MyFeedbackPage />)} />
        <Route path="/admin/audit" element={guard('admin', <AuditLogPage />)} />
        <Route path="/admin/feedback" element={guard('admin', <FeedbackPage />)} />
        <Route path="/admin/data" element={guard('admin', <DataStatusPage />)} />
        <Route path="/admin/users" element={guard('admin', <UsersPage />)} />
        <Route path="/admin/usage" element={guard('admin', <UsagePage />)} />
        <Route path="/admin/system" element={guard('admin', <SystemPage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
