import { lazy, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageGuard } from '../auth/guards';
import LoginPage from '../pages/LoginPage';
import DashboardPage from '../pages/DashboardPage';
const OpdPage = lazy(() => import('../pages/OpdPage'));
const IpdPage = lazy(() => import('../pages/IpdPage'));
const ErPage = lazy(() => import('../pages/ErPage'));
const QueuePage = lazy(() => import('../pages/QueuePage'));
const Icd10SearchPage = lazy(() => import('../pages/Icd10SearchPage'));
const DentalPage = lazy(() => import('../pages/DentalPage'));
const PhysioPage = lazy(() => import('../pages/PhysioPage'));
const TelemedicinePage = lazy(() => import('../pages/TelemedicinePage'));
const ThaiMedicinePage = lazy(() => import('../pages/ThaiMedicinePage'));
const ReadmitPage = lazy(() => import('../pages/ReadmitPage'));
const ReferralPage = lazy(() => import('../pages/ReferralPage'));
const DrugBudgetPage = lazy(() => import('../pages/DrugBudgetPage'));
const AuditLogPage = lazy(() => import('../pages/admin/AuditLogPage'));
const UsagePage = lazy(() => import('../pages/admin/UsagePage'));
const FeedbackPage = lazy(() => import('../pages/admin/FeedbackPage'));
const DataStatusPage = lazy(() => import('../pages/admin/DataStatusPage'));
const UsersPage = lazy(() => import('../pages/admin/UsersPage'));
const SystemPage = lazy(() => import('../pages/admin/SystemPage'));
const ContactPage = lazy(() => import('../pages/ContactPage'));
const PostalDrugPage = lazy(() => import('../pages/PostalDrugPage'));
const MyFeedbackPage = lazy(() => import('../pages/MyFeedbackPage'));

/* หน้าอื่นนอกจากหน้าแรกแยกไฟล์ — โหลดเมื่อเปิดหน้านั้นครั้งแรก (ไฟล์เริ่มต้นเล็กลง เปิดเว็บเร็วขึ้น) · ระหว่างโหลดแสดงโครงหน้า (Layout) */

const guard = (page: string, element: ReactNode) => <PageGuard page={page}>{element}</PageGuard>;

export default function AppRoutes() {
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
