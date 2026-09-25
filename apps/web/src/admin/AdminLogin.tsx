import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, LogIn } from 'lucide-react';
import { api, ApiError, storeToken } from '../api/client.js';
import { BRAND } from '../brand.js';
import { BrandLogo, ThemeToggle } from '../components/ui.js';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(import.meta.env.DEV ? 'admin@hidro.local' : '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string }>('/admin/auth/login', { method: 'POST', body: { email, password } });
      storeToken(r.token);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al iniciar sesión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <ThemeToggle className="absolute right-4 top-4" />
      <main className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandLogo size={72} />
          <div>
            <h1 className="font-display text-xl font-semibold">{BRAND.appName}</h1>
            <p className="text-sm text-muted">{BRAND.subtitle} · Panel de administración</p>
          </div>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6" data-testid="admin-login">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Lock size={15} aria-hidden="true" />
            Acceso solo para la cooperativa
          </div>
          <div>
            <label htmlFor="login-email" className="mb-1 block text-sm font-semibold">Email</label>
            <input id="login-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-semibold">Contraseña</label>
            <input id="login-password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error ? <div role="alert" className="rounded-xl bg-err-soft p-3 text-sm text-err">{error}</div> : null}
          <button className="btn btn-primary min-h-12 w-full text-base" disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}
            {busy ? 'Verificando…' : 'Ingresar'}
          </button>
          {import.meta.env.DEV ? (
            <div className="text-center text-xs text-muted">
              Credenciales DEMO: admin@hidro.local / hidro-demo-2025
            </div>
          ) : null}
        </form>
      </main>
    </div>
  );
}
