/** Logs estructurados JSON. Nunca dependemos de console.log para trazabilidad. */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(meta: Record<string, unknown>): Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(namespace: string, level: LogLevel = 'info'): Logger {
  const write = (lvl: LogLevel, msg: string, meta?: Record<string, unknown>, base: Record<string, unknown> = {}) => {
    if (LEVEL_ORDER[lvl] < LEVEL_ORDER[level]) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), level: lvl, ns: namespace, msg, ...base, ...(meta ?? {}) });
    if (lvl === 'error') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  };
  return {
    debug: (msg, meta) => write('debug', msg, meta),
    info: (msg, meta) => write('info', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    error: (msg, meta) => write('error', msg, meta),
    child: (base) => ({
      debug: (msg, meta) => write('debug', msg, meta, base),
      info: (msg, meta) => write('info', msg, meta, base),
      warn: (msg, meta) => write('warn', msg, meta, base),
      error: (msg, meta) => write('error', msg, meta, base),
      child: (more) => createLogger(namespace, level).child({ ...base, ...more }),
    }),
  };
}

export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
};
