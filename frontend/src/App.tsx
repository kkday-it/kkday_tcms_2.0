import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import Repository from './pages/Repository';
import TestRuns from './pages/TestRuns';
import TestRunDetails from './pages/TestRunDetails';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Account from './pages/Account';
import TestPlans from './pages/TestPlans';
import TestPlanDetails from './pages/TestPlanDetails';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';

import ForceChangePassword from './pages/ForceChangePassword';
import FeLog from './pages/FeLog';
import BeLog from './pages/BeLog';
import GoogleCallback from './pages/GoogleCallback';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('tcms_token');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function App() {
  // 掛在 /tcms 子路徑時，VITE_BASE_URL=/tcms/，需設定 basename 讓 URL 正確
  const basename = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/force-change-password" element={<ForceChangePassword />} />
        {/* 隱藏頁面（公開，read-only）：不需登入即可查看 */}
        <Route path="/fe-log" element={<FeLog />} />
        <Route path="/be-log" element={<BeLog />} />
        {/* Google OAuth callback — public, no token required */}
        <Route path="/auth/google/callback" element={<GoogleCallback />} />

        <Route element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route path="/" element={<Dashboard />} />
          <Route path="/repository" element={<Repository />} />
          {/* backward-compat: old /project/:id links still work */}
          <Route path="/project/:projectId" element={<Navigate to="/repository" replace />} />
          <Route path="/runs" element={<TestRuns />} />
          <Route path="/runs/:runId" element={<TestRunDetails />} />
          <Route path="/users" element={<Users />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/account" element={<Account />} />
          <Route path="/plans" element={<TestPlans />} />
          <Route path="/plans/:planId" element={<TestPlanDetails />} />


          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
