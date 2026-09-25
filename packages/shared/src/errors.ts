/** Errores tipados de dominio. Cada código mapea a un HTTP status en la API. */
export const ERROR_CODES = {
  MACHINE_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  PAYMENT_NOT_FOUND: 404,
  AUTH_NOT_FOUND: 404,
  DEVICE_NOT_FOUND: 404,
  MACHINE_OFFLINE: 503,
  MACHINE_BUSY: 409,
  MACHINE_DISABLED: 403,
  MACHINE_NOT_ENABLED: 403,
  SESSION_ALREADY_RUNNING: 409,
  AUTH_EXPIRED: 409,
  AUTH_CONSUMED: 409,
  AUTH_REVOKED: 409,
  AUTH_WRONG_MACHINE: 403,
  INVALID_TRANSITION: 409,
  PAYMENT_AMOUNT_MISMATCH: 409,
  PAYMENT_INVALID_WEBHOOK: 401,
  PAYMENT_WEBHOOK_UNKNOWN: 404,
  PAYMENT_SIMULATION_NOT_ALLOWED: 403,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  PASSWORD_CHANGE_REQUIRED: 403,
  INVALID_CURRENT_PASSWORD: 400,
  CONFLICT: 409,
  USER_NOT_FOUND: 404,
  DEVICE_UNAUTHORIZED: 401,
  DEVICE_UNREGISTERED: 401,
  DEVICE_MACHINE_MISMATCH: 403,
  SETTINGS_LOCKED_WHILE_RUNNING: 409,
  PLATE_REQUIRED: 400,
  PLATE_INVALID: 400,
  PLATE_LIMIT_REACHED: 409,
  SIMULATOR_DISABLED: 403,
  DEMO_MODE_REQUIRED: 403,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = ERROR_CODES[code];
    this.details = details;
  }
}

export function errorCodeOf(err: unknown): ErrorCode {
  return err instanceof AppError ? err.code : 'INTERNAL';
}

export function httpStatusOf(err: unknown): number {
  return err instanceof AppError ? err.httpStatus : 500;
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
