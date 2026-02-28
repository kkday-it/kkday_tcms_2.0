import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import Repository from './pages/Repository';
import TestRuns from './pages/TestRuns';
import TestRunDetails from './pages/TestRunDetails';
import Users from './pages/Users';
import Settings from './pages/Settings';
import TestPlans from './pages/TestPlans';
import TestPlanDetails from './pages/TestPlanDetails';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';

import ForceChangePassword from './pages/ForceChangePassword';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('tcms_token');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/force-change-password" element={<ForceChangePassword />} />

        <Route element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route path="/" element={<Dashboard />} />
          <Route path="/project/:projectId" element={<Repository />} />
          <Route path="/runs" element={<TestRuns />} />
          <Route path="/runs/:runId" element={<TestRunDetails />} />
          <Route path="/users" element={<Users />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/plans" element={<TestPlans />} />
          <Route path="/plans/:planId" element={<TestPlanDetails />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
