import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, MessageCircle, Plus, Settings2, UserRound, Users } from 'lucide-react';
import { ASSIGNABLE_ROLES, MIN_PASSWORD_LENGTH, ROLE_LABELS, type AssignableRole, type Role } from '@hidro/shared';
import { api, ApiError } from '../../api/client.js';
import { usePolling } from '../../lib/usePolling.js';
import { EmptyState, Modal } from '../../components/ui.js';
import { useSession } from '../session.js';
import { generatePassword, PasswordInput } from '../passwordFields.js';
import { credentialsMessage, sortUsers, userActionState, type PanelUser } from '../userRules.js';

const ROLE_BADGE: Record<Role, string> = {
  tecnico: 'bg-surface-2 text-muted',
  admin: 'bg-primary-soft text-primary-soft-ink',
  operador: 'bg-warn-soft text-warn',
};

const ROLE_HELP: Record<AssignableRole, string> = {
  admin: 'Todo lo del negocio: patentes, precios, límite diario y las cuentas del panel.',
  operador: 'Mira el panel, destraba pagos y puede detener la máquina. No cambia patentes, precios ni ajustes.',
};

function RoleBadge({ role }: { role: Role }) {
  return <span className={`chip border-transparent ${ROLE_BADGE[role]}`}>{ROLE_LABELS[role]}</span>;
}

function StateBadge({ user }: { user: PanelUser }) {
  if (!user.active) return <span className="chip border-transparent bg-surface-2 text-muted">Desactivada</span>;
  if (user.mustChangePassword) return <span className="chip border-transparent bg-warn-soft text-warn">Falta que entre</span>;
  return <span className="chip border-transparent bg-primary-soft text-primary-soft-ink">Activa</span>;
}

export default function UsersPage() {
  const { me } = useSession();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PanelUser | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api<{ users: PanelUser[] }>('/admin/users');
      return sortUsers(r.users);
    } catch {
      return null;
    }
  }, []);
  const users = usePolling(load, 10_000, true, version);
  const reload = () => setVersion((v) => v + 1);

  if (!me) return null;
  const others = (users ?? []).filter((u) => u.id !== me.id && u.role !== 'tecnico');

  return (
    <div className="stagger space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-wide">Usuarios</h1>
          <p className="text-sm text-muted">Quién entra al panel y qué puede hacer.</p>
        </div>
        <button className="btn btn-primary min-h-11 gap-2 px-5" onClick={() => setCreating(true)} data-testid="user-new">
          <Plus size={16} aria-hidden="true" /> Nuevo usuario
        </button>
      </header>

      {users === null ? (
        <div className="card h-40 animate-pulse" aria-hidden="true" />
      ) : (
        <>
          {/* escritorio: tabla */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm" data-testid="users-table">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Rol</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const state = userActionState(u, me, users);
                  return (
                    <tr key={u.id} className={`border-b border-line/50 last:border-0 ${u.active ? '' : 'opacity-60'}`} data-testid={`user-row-${u.email}`}>
                      <td className="px-4 py-3 font-semibold">
                        {u.name ?? '—'} {u.id === me.id ? <span className="font-normal text-muted">(vos)</span> : null}
                      </td>
                      <td className="px-4 py-3 text-muted">{u.email}</td>
                      <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                      <td className="px-4 py-3"><StateBadge user={u} /></td>
                      <td className="px-4 py-3 text-right">
                        {state.locked ? null : (
                          <button className="btn btn-ghost min-h-11 gap-1.5 px-3 text-sm" onClick={() => setEditing(u)} data-testid={`user-actions-${u.email}`}>
                            <Settings2 size={15} aria-hidden="true" /> Gestionar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* celular: tarjetas */}
          <div className="grid gap-3 md:hidden">
            {users.map((u) => {
              const state = userActionState(u, me, users);
              return (
                <div key={u.id} className={`card space-y-2 p-4 ${u.active ? '' : 'opacity-60'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">
                        {u.name ?? '—'} {u.id === me.id ? <span className="font-normal text-muted">(vos)</span> : null}
                      </div>
                      <div className="truncate text-sm text-muted">{u.email}</div>
                    </div>
                    <StateBadge user={u} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <RoleBadge role={u.role} />
                    {state.locked ? null : (
                      <button className="btn btn-ghost min-h-11 gap-1.5 px-3 text-sm" onClick={() => setEditing(u)}>
                        <Settings2 size={15} aria-hidden="true" /> Gestionar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {others.length === 0 ? (
            <EmptyState icon={<Users size={22} />} title="Todavía no hay más cuentas" sub="Creá la de tu primer operador con “Nuevo usuario”." />
          ) : null}

          {users.some((u) => u.role === 'tecnico') ? (
            <p className="text-xs text-muted">
              La cuenta “{ROLE_LABELS.tecnico}” es la de Insolva: la usamos para el mantenimiento técnico (la placa de la
              máquina y los ajustes del sistema). No destraba pagos y no se puede modificar desde acá.
            </p>
          ) : null}
        </>
      )}

      {creating ? (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={reload}
        />
      ) : null}
      {editing && users ? (
        <ManageUserModal
          user={users.find((u) => u.id === editing.id) ?? editing}
          state={userActionState(users.find((u) => u.id === editing.id) ?? editing, me, users)}
          onClose={() => setEditing(null)}
          onChanged={reload}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- alta

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole>('operador');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: 'name' | 'email' | 'password' | null; text: string } | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function fail(field: 'name' | 'email' | 'password' | null, text: string) {
    setError({ field, text });
    ({ name: nameRef, email: emailRef, password: passwordRef } as const)[field ?? 'name']?.current?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return fail('name', 'Ingresá el nombre.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return fail('email', 'Revisá el email.');
    if (password.length < MIN_PASSWORD_LENGTH) return fail('password', `La clave inicial tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    setBusy(true);
    try {
      const r = await api<{ user: PanelUser }>('/admin/users', { method: 'POST', body: { name: name.trim(), email, role, password } });
      setCreated({ name: r.user.name ?? name.trim(), email: r.user.email, password });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) fail('email', 'Ya existe una cuenta con ese email.');
      else fail(null, err instanceof ApiError ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Modal open onClose={onClose} title="Cuenta creada">
        <CredentialsHandoff {...created} />
        <button className="btn btn-ghost mt-4 min-h-11 w-full" onClick={onClose}>Listo</button>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Nuevo usuario">
      <form onSubmit={submit} className="space-y-4" noValidate data-testid="user-create-form">
        <div>
          <label htmlFor="nu-name" className="mb-1 block text-sm font-semibold">Nombre</label>
          <input ref={nameRef} id="nu-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-invalid={error?.field === 'name' || undefined} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="nu-email" className="mb-1 block text-sm font-semibold">Email</label>
          <input ref={emailRef} id="nu-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={error?.field === 'email' || undefined} autoComplete="off" />
        </div>
        <fieldset>
          <legend className="mb-1 block text-sm font-semibold">Rol</legend>
          <div className="grid gap-2">
            {ASSIGNABLE_ROLES.map((r) => (
              <label key={r} className={`flex min-h-11 cursor-pointer gap-3 rounded-xl border p-3 ${role === r ? 'border-primary bg-primary-soft' : 'border-line'}`}>
                <input type="radio" name="nu-role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-1" />
                <span>
                  <span className="block font-semibold">{ROLE_LABELS[r]}</span>
                  <span className="block text-xs text-muted">{ROLE_HELP[r]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="nu-password" className="block text-sm font-semibold">Clave inicial</label>
            <button type="button" className="min-h-11 px-2 text-sm font-semibold text-primary" onClick={() => setPassword(generatePassword())}>
              Generar una
            </button>
          </div>
          <PasswordInput ref={passwordRef} id="nu-password" value={password} onChange={setPassword} autoComplete="new-password" invalid={error?.field === 'password'} testId="nu-password" />
          <p className="mt-1 text-xs text-muted">Al menos {MIN_PASSWORD_LENGTH} caracteres. La persona la cambia la primera vez que entra.</p>
        </div>
        {error ? <div role="alert" className="rounded-xl bg-err-soft p-3 text-sm text-err">{error.text}</div> : null}
        <button className="btn btn-primary min-h-11 w-full" disabled={busy} data-testid="nu-submit">
          {busy ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
    </Modal>
  );
}

/** Pantalla para pasarle la clave a la persona: copiar o mandar por WhatsApp (lo elige quien la crea). */
function CredentialsHandoff({ name, email, password }: { name: string; email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  const message = credentialsMessage({ name, email, password, panelUrl: `${window.location.origin}/admin` });

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sin portapapeles: el texto queda visible para copiarlo a mano */
    }
  }

  return (
    <div className="space-y-3" data-testid="credentials-handoff">
      <dl className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted">Email</dt><dd className="font-semibold">{email}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Clave inicial</dt><dd className="num font-semibold" data-testid="handoff-password">{password}</dd></div>
      </dl>
      <p className="text-sm text-muted">Al entrar la primera vez le vamos a pedir que la cambie.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className="btn btn-ghost min-h-11 gap-2" onClick={() => void copy()}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copied ? 'Copiado' : 'Copiar'}
        </button>
        <a className="btn btn-primary min-h-11 gap-2" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
          <MessageCircle size={16} aria-hidden="true" /> Enviar por WhatsApp
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- gestionar

type Confirming = 'deactivate' | 'reset' | null;

function ManageUserModal({
  user,
  state,
  onClose,
  onChanged,
}: {
  user: PanelUser;
  state: ReturnType<typeof userActionState>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const displayName = user.name ?? user.email;
  const [name, setName] = useState(user.name ?? '');
  const [role, setRole] = useState<Role>(user.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [reset, setReset] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/users/${user.id}`, { method: 'PATCH', body });
      onChanged();
      return true;
    } catch (err) {
      // No se borra lo que la persona escribió: el error va al lado de la acción.
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    if (name.trim() && name.trim() !== user.name) body.name = name.trim();
    if (role !== user.role && role !== 'tecnico') body.role = role;
    if (Object.keys(body).length === 0) return;
    if (await patch(body)) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  if (reset) {
    return (
      <Modal open onClose={onClose} title="Clave reseteada">
        <CredentialsHandoff name={displayName} email={user.email} password={reset} />
        <button className="btn btn-ghost mt-4 min-h-11 w-full" onClick={onClose}>Listo</button>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={displayName}>
      <div className="space-y-5" data-testid="user-manage">
        <form onSubmit={saveProfile} className="space-y-3">
          <div>
            <label htmlFor="mu-name" className="mb-1 block text-sm font-semibold">Nombre</label>
            <input id="mu-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div>
            <label htmlFor="mu-role" className="mb-1 block text-sm font-semibold">Rol</label>
            <select
              id="mu-role"
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={state.changeRole !== null}
              aria-describedby={state.changeRole ? 'mu-role-why' : undefined}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            {state.changeRole ? <p id="mu-role-why" className="mt-1 text-xs text-muted">{state.changeRole}</p> : null}
            {role !== user.role ? <p className="mt-1 text-xs text-warn">Al guardar, {displayName} va a tener que volver a entrar.</p> : null}
          </div>
          <button className="btn btn-primary min-h-11 px-5" disabled={busy}>{saved ? '✓ Guardado' : 'Guardar'}</button>
        </form>

        <div className="space-y-2 border-t border-line pt-4">
          <div className="text-sm font-semibold">Acceso</div>
          {confirming === 'deactivate' ? (
            <div className="space-y-2 rounded-xl bg-err-soft p-3 text-sm text-err" role="alert">
              <p>{displayName} queda afuera del panel en el acto. Podés reactivarla después.</p>
              <div className="flex gap-2">
                <button
                  className="btn btn-danger min-h-11 px-4"
                  disabled={busy}
                  data-testid="mu-deactivate-confirm"
                  onClick={async () => {
                    if (await patch({ active: false })) setConfirming(null);
                  }}
                >
                  Sí, desactivar
                </button>
                <button className="btn btn-ghost min-h-11 px-4" onClick={() => setConfirming(null)}>Cancelar</button>
              </div>
            </div>
          ) : user.active ? (
            <div>
              <button
                className="btn btn-ghost min-h-11 px-4 text-err"
                disabled={state.deactivate !== null || busy}
                onClick={() => setConfirming('deactivate')}
                data-testid="mu-deactivate"
              >
                Desactivar cuenta
              </button>
              {state.deactivate ? <p className="mt-1 text-xs text-muted">{state.deactivate}</p> : null}
            </div>
          ) : (
            <button className="btn btn-ghost min-h-11 px-4" disabled={busy} onClick={() => void patch({ active: true })}>
              Reactivar cuenta
            </button>
          )}

          {confirming === 'reset' ? (
            <div className="space-y-2 rounded-xl bg-warn-soft p-3 text-sm text-warn" role="alert">
              <p>Se genera una clave nueva y {displayName} tiene que volver a entrar con ella.</p>
              <div className="flex gap-2">
                <button
                  className="btn btn-primary min-h-11 px-4"
                  disabled={busy}
                  onClick={async () => {
                    const password = generatePassword();
                    if (await patch({ password })) setReset(password);
                  }}
                >
                  Sí, resetear
                </button>
                <button className="btn btn-ghost min-h-11 px-4" onClick={() => setConfirming(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div>
              <button
                className="btn btn-ghost min-h-11 px-4"
                disabled={state.resetPassword !== null || busy || !user.active}
                onClick={() => setConfirming('reset')}
              >
                Resetear clave
              </button>
              {state.resetPassword ? <p className="mt-1 text-xs text-muted">{state.resetPassword}</p> : null}
            </div>
          )}
        </div>

        {error ? <div role="alert" className="rounded-xl bg-err-soft p-3 text-sm text-err">{error}</div> : null}
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <UserRound size={13} aria-hidden="true" /> {user.email}
        </p>
      </div>
    </Modal>
  );
}
