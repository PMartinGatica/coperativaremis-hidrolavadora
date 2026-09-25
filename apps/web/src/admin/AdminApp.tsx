import { Navigate, Route, Routes } from 'react-router-dom';
import { getToken } from '../api/client.js';
import AdminLayout from './AdminLayout.js';
import AdminLogin from './AdminLogin.js';
import { SessionProvider, useSession } from './session.js';
import DashboardPage from './pages/DashboardPage.js';
import MachinesPage from './pages/MachinesPage.js';
import VehiclesPage from './pages/VehiclesPage.js';
import SessionsPage from './pages/SessionsPage.js';
import SessionDetailPage from './pages/SessionDetailPage.js';
import PaymentsPage from './pages/PaymentsPage.js';
import LogsPage from './pages/LogsPage.js';
import SettingsPage from './pages/SettingsPage.js';
import UsersPage from './pages/UsersPage.js';
import AccountPage from './pages/AccountPage.js';

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const token = getToken();
  if (!token) return <Navigate to="/admin/login" replace />;
  return <SessionProvider>{children}</SessionProvider>;
}

/** Usuarios solo para quien los gestiona; el resto vuelve al inicio (el servidor igual da 403). */
function RequireUsers({ children }: { children: React.ReactNode }) {
  const { me, can } = useSession();
  if (me === null) return null;
  if (!can('usuarios.gestionar')) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

export default function AdminApp() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLogin />} />
      <Route
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="machines" element={<MachinesPage />} />
        <Route path="vehicles" element={<VehiclesPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="sessions/:sessionId" element={<SessionDetailPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="users"
          element={
            <RequireUsers>
              <UsersPage />
            </RequireUsers>
          }
        />
        <Route path="account" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
