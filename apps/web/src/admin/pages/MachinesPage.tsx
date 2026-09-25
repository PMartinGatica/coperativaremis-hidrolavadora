import { useCallback, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, Download, KeyRound, Pencil, QrCode } from 'lucide-react';
import { api } from '../../api/client.js';
import { usePolling } from '../../lib/usePolling.js';
import { formatArs, formatMinutes, timeAgo } from '../../lib/format.js';
import { MachineBadge, Modal, StatusBadge } from '../../components/ui.js';
import type { MachineStatus, SessionStatus } from '@hidro/shared';
import { useSession } from '../session.js';

interface AdminMachine {
  id: string;
  name: string;
  description: string | null;
  status: MachineStatus;
  priceRemisArs: number;
  priceSocioArs: number;
  priceExternoArs: number;
  durationSeconds: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  device: {
    id: string;
    deviceIdentifier: string;
    firmwareVersion: string | null;
    lastHeartbeatAt: string | null;
    status: string;
    relayState: boolean;
    wifiRssi: number | null;
    uptime: number | null;
  } | null;
  activeSession: { id: string; status: SessionStatus; createdAt: string } | null;
}

export default function MachinesPage() {
  const { can } = useSession();
  const [editId, setEditId] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [stopId, setStopId] = useState<string | null>(null);
  const [secretFor, setSecretFor] = useState<{ machineId: string; secret: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ machines: AdminMachine[] }>('/admin/machines');
      return r.machines;
    } catch {
      return null;
    }
  }, []);
  const machines = usePolling(load, 4000);

  return (
    <div className="stagger space-y-5">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-wide">Máquinas</h1>
        <p className="text-sm text-dim">Precio, duración, habilitación, QR, credenciales y parada de emergencia</p>
      </header>

      {machines === null ? (
        <div className="card p-10 text-center text-dim">CARGANDO…</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {machines.map((m) => (
            <div key={m.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-xl font-semibold">{m.id}</div>
                  <div className="text-xs text-dim">{m.name}</div>
                  {m.activeSession ? (
                    <div className="mt-1.5">
                      <StatusBadge status={m.activeSession.status} />
                    </div>
                  ) : null}
                </div>
                <MachineBadge status={m.status} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-dim">
                <span>Tarifas: <span className="num text-ink">{formatArs(m.priceRemisArs)} / {formatArs(m.priceSocioArs)} / {formatArs(m.priceExternoArs)}</span></span>
                <span>Duración: <span className="num text-ink">{formatMinutes(m.durationSeconds)}</span></span>
                <span>Firmware: <span className="num">{m.device?.firmwareVersion ?? '—'}</span></span>
                <span>Heartbeat: <span className="num">{timeAgo(m.device?.lastHeartbeatAt)}</span></span>
                <span>Relay: <span className={`num ${m.device?.relayState ? 'text-warn' : ''}`}>{m.device?.relayState ? 'ON' : 'OFF'}</span></span>
                <span>WiFi: <span className="num">{m.device?.wifiRssi !== null && m.device?.wifiRssi !== undefined ? `${m.device.wifiRssi} dBm` : '—'}</span></span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {can('maquina.configurar') ? (
                  <button className="btn btn-ghost gap-1.5 py-2 text-xs" onClick={() => setEditId(m.id)}>
                    <Pencil size={12} /> EDITAR
                  </button>
                ) : null}
                <button className="btn btn-ghost gap-1.5 py-2 text-xs" onClick={() => setQrId(m.id)}>
                  <QrCode size={12} /> GENERAR QR
                </button>
                {can('dispositivo.rotar_clave') ? (
                  <button className="btn btn-ghost gap-1.5 py-2 text-xs" onClick={() => void rotateSecret(m.id, setSecretFor)}>
                    <KeyRound size={12} /> ROTAR SECRET
                  </button>
                ) : null}
                {can('maquina.parada_emergencia') ? (
                  <button className="btn btn-danger gap-1.5 py-2 text-xs" onClick={() => setStopId(m.id)}>
                    <AlertTriangle size={12} /> DETENER MÁQUINA
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {editId ? <EditMachineModal machineId={editId} onClose={() => setEditId(null)} /> : null}
      {qrId ? <QrModal machineId={qrId} onClose={() => setQrId(null)} /> : null}
      {stopId ? <EmergencyStopModal machineId={stopId} onClose={() => setStopId(null)} /> : null}
      {secretFor ? (
        <Modal open onClose={() => setSecretFor(null)} title={`Nuevo secret — ${secretFor.machineId}`}>
          <p className="text-sm text-dim">
            Guardalo ahora: se muestra <b>una sola vez</b> y es lo único que identifica al ESP32 de esta máquina.
            Flashealo en el firmware (HIDRO_DEVICE_SECRET). Los demás dispositivos no se ven afectados.
          </p>
          <pre className="num mt-3 break-all rounded-xl border border-aqua/30 bg-aqua/5 p-3 text-xs text-aqua">{secretFor.secret}</pre>
        </Modal>
      ) : null}
    </div>
  );
}

async function rotateSecret(machineId: string, setSecret: (s: { machineId: string; secret: string }) => void) {
  try {
    const r = await api<{ secret: string }>(`/admin/devices/${machineId}/rotate-secret`, { method: 'POST' });
    setSecret({ machineId, secret: r.secret });
  } catch {
    /* silencioso: el admin verá el error en logs */
  }
}

// ---------------- Modales ----------------

function EditMachineModal({ machineId, onClose }: { machineId: string; onClose: () => void }) {
  const [priceRemis, setPriceRemis] = useState('');
  const [priceSocio, setPriceSocio] = useState('');
  const [priceExterno, setPriceExterno] = useState('');
  const [duration, setDuration] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  usePolling(useCallback(async () => {
    const r = await api<{ machine: AdminMachine }>(`/admin/machines/${machineId}`);
    setPriceRemis(String(r.machine.priceRemisArs));
    setPriceSocio(String(r.machine.priceSocioArs));
    setPriceExterno(String(r.machine.priceExternoArs));
    setDuration(String(r.machine.durationSeconds));
    return null;
  }, [machineId]), 60_000, true);

  async function save() {
    setError(null);
    try {
      const patch: Record<string, unknown> = {};
      const pr = Number(priceRemis);
      const ps = Number(priceSocio);
      const pe = Number(priceExterno);
      const d = Number(duration);
      if (Number.isFinite(pr) && pr > 0) patch.priceRemisArs = Math.round(pr);
      if (Number.isFinite(ps) && ps > 0) patch.priceSocioArs = Math.round(ps);
      if (Number.isFinite(pe) && pe > 0) patch.priceExternoArs = Math.round(pe);
      if (Number.isFinite(d) && d >= 10) patch.durationSeconds = Math.round(d);
      await api(`/admin/machines/${machineId}`, { method: 'PATCH', body: patch });
      setSaved(true);
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    }
  }

  return (
    <Modal open onClose={onClose} title={`Editar ${machineId}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-[0.65rem] uppercase tracking-[0.2em] text-faint">Remis (ARS)</label>
            <input className="input num" value={priceRemis} onChange={(e) => setPriceRemis(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <label className="mb-1 block text-[0.65rem] uppercase tracking-[0.2em] text-faint">Socio (ARS)</label>
            <input className="input num" value={priceSocio} onChange={(e) => setPriceSocio(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <label className="mb-1 block text-[0.65rem] uppercase tracking-[0.2em] text-faint">Externo (ARS)</label>
            <input className="input num" value={priceExterno} onChange={(e) => setPriceExterno(e.target.value)} inputMode="numeric" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[0.65rem] uppercase tracking-[0.2em] text-faint">Duración (segundos)</label>
          <input className="input num" value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="numeric" />
        </div>
        <p className="text-[0.68rem] text-faint">Bloqueado automáticamente mientras haya una sesión activa en la máquina.</p>
        {error ? <div className="rounded-xl border border-err/30 bg-err/10 p-3 text-sm text-err">{error}</div> : null}
        <button className="btn btn-aqua w-full py-2.5 text-sm" onClick={save}>
          {saved ? '✓ GUARDADO' : 'GUARDAR CAMBIOS'}
        </button>
      </div>
    </Modal>
  );
}

function QrModal({ machineId, onClose }: { machineId: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [url, setUrl] = useState<string>('');

  usePolling(useCallback(async () => {
    const r = await api<{ url: string }>(`/admin/machines/${machineId}/qr`);
    setUrl(r.url);
    const img = await QRCode.toDataURL(r.url, {
      width: 480,
      margin: 2,
      color: { dark: '#0b1118', light: '#ffffff' },
    });
    setDataUrl(img);
    return null;
  }, [machineId]), 60_000, true);

  return (
    <Modal open onClose={onClose} title={`QR — ${machineId}`}>
      <div className="space-y-3">
        <div className="rounded-2xl border border-line bg-white p-4">
          {dataUrl ? <img src={dataUrl} alt={`QR de ${machineId}`} className="mx-auto w-64" /> : <div className="py-16 text-center text-sm text-dim">Generando…</div>}
        </div>
        <div className="num break-all rounded-xl border border-line bg-surface-2 p-3 text-xs text-dim">{url}</div>
        <p className="text-[0.68rem] text-faint">El QR solo identifica la máquina — no contiene datos sensibles.</p>
        {dataUrl ? (
          <a className="btn btn-aqua w-full py-2.5 text-sm" href={dataUrl} download={`qr-${machineId}.png`}>
            <Download size={14} /> DESCARGAR PNG PARA IMPRIMIR
          </a>
        ) : null}
      </div>
    </Modal>
  );
}

function EmergencyStopModal({ machineId, onClose }: { machineId: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function stop() {
    setError(null);
    try {
      const r = await api<{ sessionId: string | null }>(`/admin/machines/${machineId}/emergency-stop`, {
        method: 'POST',
        body: { confirmation: 'DETENER', reason: 'parada desde panel admin' },
      });
      setDone(r.sessionId ?? 'sin-sesion-activa');
      setTimeout(onClose, 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error.');
    }
  }

  return (
    <Modal open onClose={onClose} title={`DETENER ${machineId}`}>
      <div className="space-y-4">
        <div className="rounded-xl border border-err/30 bg-err/10 p-3 text-sm text-err">
          Se cortará el relay de inmediato (la orden viaja al ESP32 por el próximo heartbeat) y la sesión activa pasará
          a EMERGENCY_STOP. Queda registrado quién ejecutó la acción.
        </div>
        <div>
          <label className="mb-1 block text-[0.65rem] uppercase tracking-[0.2em] text-faint">Escribí DETENER para confirmar</label>
          <input className="input" value={text} onChange={(e) => setText(e.target.value.toUpperCase())} placeholder="DETENER" />
        </div>
        {error ? <div className="text-sm text-err">{error}</div> : null}
        <button className="btn btn-danger w-full py-3 text-sm" disabled={text !== 'DETENER'} onClick={stop}>
          {done ? `✓ ${done === 'sin-sesion-activa' ? 'RELAY CORTADO' : 'SESIÓN EN EMERGENCY_STOP'}` : 'CONFIRMAR PARADA DE EMERGENCIA'}
        </button>
      </div>
    </Modal>
  );
}
