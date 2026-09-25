import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** Campo de clave con mostrar/ocultar (objetivo táctil ≥ 44 px). */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  {
    id: string;
    value: string;
    onChange: (v: string) => void;
    autoComplete: 'current-password' | 'new-password';
    invalid?: boolean;
    testId?: string;
  }
>(function PasswordInput({ id, value, onChange, autoComplete, invalid, testId }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        id={id}
        className="input pr-12"
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        data-testid={testId}
        spellCheck={false}
        autoCapitalize="off"
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-ink"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar clave' : 'Mostrar clave'}
      >
        {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
      </button>
    </div>
  );
});

// Sin caracteres que se confunden al dictarla o leerla en un celular (0/O, 1/l/I).
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Clave inicial legible: 3 grupos de 4, p. ej. "kf7m-q2xh-9tpw" (14 caracteres). */
export function generatePassword(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join('')).join('-');
}
