import { randomBytes, randomUUID } from 'node:crypto';

export const uuid = (): string => randomUUID();

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos

function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  return out;
}

/** Id de sesión legible: HS-8F3K2Q */
export function newSessionId(): string {
  return `HS-${randomCode(6)}`;
}

/** Id externo de pago DEMO */
export function newDemoPaymentId(): string {
  return `DEMO-${randomCode(8)}`;
}

/** Secret de dispositivo: 32 bytes base64url */
export function newDeviceSecret(): string {
  return randomBytes(32).toString('base64url');
}
