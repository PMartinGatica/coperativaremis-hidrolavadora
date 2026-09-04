import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import MachinePage from './pages/MachinePage.js';
import LandingPage from './pages/LandingPage.js';

// Rutas secundarias en chunks separados: la página del cliente queda LIVIANA.
const PayDemoPage = lazy(() => import('./pages/PayDemoPage.js'));
const DemoDevicePage = lazy(() => import('./pages/DemoDevicePage.js'));
const AdminApp = lazy(() => import('./admin/AdminApp.js'));

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-dim">
      <div className="num text-sm tracking-widest">CARGANDO…</div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/machine/:machineId" element={<MachinePage />} />
        <Route path="/pay/:externalId" element={<PayDemoPage />} />
        <Route path="/demo/device" element={<DemoDevicePage />} />
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
