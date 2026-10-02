import type { ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageGuard } from '../auth/guards';
import LoginPage from '../pages/LoginPage';
import DashboardPage from '../pages/DashboardPage';
import OpdPage from '../pages/OpdPage';
import IpdPage from '../pages/IpdPage';
import ErPage from '../pages/ErPage';
import QueuePage from '../pages/QueuePage';
import Icd10SearchPage from '../pages/Icd10SearchPage';
import DentalPage from '../pages/DentalPage';
import PhysioPage from '../pages/PhysioPage';
import TelemedicinePage from '../pages/TelemedicinePage';
import ThaiMedicinePage from '../pages/ThaiMedicinePage';
import ReadmitPage from '../pages/ReadmitPage';
import ReferralPage from '../pages/ReferralPage';
import DrugBudgetPage from '../pages/DrugBudgetPage';
import AuditLogPage from '../pages/admin/AuditLogPage';
import UsagePage from '../pages/admin/UsagePage';
import FeedbackPage from '../pages/admin/FeedbackPage';
import DataStatusPage from '../pages/admin/DataStatusPage';
import UsersPage from '../pages/admin/UsersPage';
import SystemPage from '../pages/admin/SystemPage';
import ContactPage from '../pages/ContactPage';
import PostalDrugPage from '../pages/PostalDrugPage';
import MyFeedbackPage from '../pages/MyFeedbackPage';

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
