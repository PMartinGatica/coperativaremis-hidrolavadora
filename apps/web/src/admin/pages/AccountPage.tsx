import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { MIN_PASSWORD_LENGTH, ROLE_LABELS } from '@hidro/shared';
import { api, ApiError, storeToken } from '../../api/client.js';
import { useSession } from '../session.js';
import { PasswordInput } from '../passwordFields.js';

export default function AccountPage() {
  const navigate = useNavigate();
  const { me, refresh } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: 'current' | 'next' | null; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);

  if (!me) return <div className="card h-48 animate-pulse" aria-hidden="true" />;

  const mustChange = me.mustChangePassword;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError({ field: 'next', text: `La clave nueva tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` });
      nextRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ token: string }>('/admin/me/password', {
        method: 'PATCH',
        body: { currentPassword: current, newPassword: next },
      });
      // Token nuevo: el anterior dejó de valer. Sigue logueada, sin volver a entrar.
      storeToken(r.token);
      setCurrent('');
      setNext('');
      setDone(true);
      await refresh();
      if (mustChange) navigate('/admin', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CURRENT_PASSWORD') {
        setError({ field: 'current', text: 'La clave actual no es correcta.' });
        currentRef.current?.focus();
      } else if (err instanceof ApiError && err.status === 429) {
        setError({ field: null, text: 'Demasiados intentos, probá en 15 minutos.' });
      } else {
        setError({ field: null, text: err instanceof ApiError ? err.message : 'No se pudo cambiar la clave.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stagger max-w-xl space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-wide">Mi cuenta</h1>
        <p className="text-sm text-muted">Tus datos y tu clave para entrar al panel.</p>
      </header>

      {mustChange ? (
        <div role="status" className="rounded-xl bg-warn-soft p-3 text-sm text-warn" data-testid="must-change-notice">
          Es tu primera vez: elegí una clave propia para seguir. La que te pasaron deja de valer.
        </div>
      ) : null}

      <section className="card p-5">
        <dl className="space-y-2 text-sm">
          {[
            ['Nombre', me.name ?? '—'],
            ['Email', me.email],
            ['Rol', ROLE_LABELS[me.role]],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line/50 pb-2 last:border-0">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
          <KeyRound size={17} aria-hidden="true" /> Cambiar clave
        </h2>
        {me.role === 'tecnico' ? (
          <p className="text-sm text-muted" data-testid="tecnico-password-note">
            La clave de esta cuenta se gestiona desde el servidor.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4" data-testid="password-form" noValidate>
            <div>
              <label htmlFor="pw-current" className="mb-1 block text-sm font-semibold">
                {mustChange ? 'Clave que te pasaron' : 'Clave actual'}
              </label>
              <PasswordInput
                ref={currentRef}
                id="pw-current"
                value={current}
                onChange={setCurrent}
                autoComplete="current-password"
                invalid={error?.field === 'current'}
                testId="pw-current"
              />
            </div>
            <div>
              <label htmlFor="pw-next" className="mb-1 block text-sm font-semibold">Clave nueva</label>
              <PasswordInput
                ref={nextRef}
                id="pw-next"
                value={next}
                onChange={setNext}
                autoComplete="new-password"
                invalid={error?.field === 'next'}
                testId="pw-next"
              />
              <p className="mt-1 text-xs text-muted">Al menos {MIN_PASSWORD_LENGTH} caracteres.</p>
            </div>
            {error ? <div role="alert" className="rounded-xl bg-err-soft p-3 text-sm text-err">{error.text}</div> : null}
            {done ? <div role="status" className="rounded-xl bg-primary-soft p-3 text-sm text-primary-soft-ink">Listo, tu clave quedó cambiada.</div> : null}
            <button className="btn btn-primary min-h-11 px-5" disabled={busy || current.length === 0 || next.length === 0} data-testid="pw-submit">
              {busy ? 'Guardando…' : 'Cambiar clave'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
