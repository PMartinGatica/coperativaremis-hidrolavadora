import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Droplets, Lock, LogIn } from 'lucide-react';
import { api, ApiError, storeToken } from '../api/client.js';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@hidro.local');
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
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="stagger w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-aqua/40 bg-aqua/10">
            <Droplets size={18} className="text-aqua" />
          </span>
          <span className="font-display text-sm font-semibold tracking-[0.22em]">
            HIDRO <span className="text-aqua">ADMIN</span>
          </span>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div className="flex items-center gap-2 text-sm text-dim">
            <Lock size={14} />
            Acceso restringido
          </div>
          <div>
            <label className="mb-1 block text-[0.65rem] uppercase tracking-[0.2em] text-faint">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          <div>
            <label className="mb-1 block text-[0.65rem] uppercase tracking-[0.2em] text-faint">Contraseña</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
          </div>
          {error ? <div className="rounded-xl border border-err/30 bg-err/10 p-3 text-sm text-err">{error}</div> : null}
          <button className="btn btn-aqua w-full py-3 text-sm" disabled={busy}>
            <LogIn size={15} /> {busy ? 'VERIFICANDO…' : 'INGRESAR'}
          </button>
          <div className="text-center text-[0.68rem] text-faint">
            Credenciales DEMO: admin@hidro.local / hidro-demo-2025
          </div>
        </form>
      </div>
    </div>
  );
}
