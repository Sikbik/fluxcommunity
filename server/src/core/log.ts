/** Compact structured logging: one JSON object per line on stdout. Never log secrets or visitor IPs. */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(base: Record<string, unknown>): Logger;
}

export type LogSink = (line: string) => void;

export function createLogger(
  level: LogLevel,
  sink: LogSink = (line) => process.stdout.write(`${line}\n`),
  base: Record<string, unknown> = {},
): Logger {
  const threshold = ORDER[level];
  const emit = (lvl: Exclude<LogLevel, 'silent'>, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[lvl] < threshold) return;
    let line: string;
    try {
      line = JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, ...base, ...fields });
    } catch {
      line = JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, note: 'unserialisable fields' });
    }
    sink(line);
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (extra) => createLogger(level, sink, { ...base, ...extra }),
  };
}

export const silentLogger: Logger = createLogger('silent');

/** Short, safe error text for logs and `lastError` (never includes URLs with credentials, stack traces). */
export function errText(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    const code =
      cause && typeof cause === 'object' && 'code' in cause ? String((cause as { code: unknown }).code) : '';
    const base =
      err.name === 'Error' || err.name === 'TypeError' ? err.message : `${err.name}: ${err.message}`;
    return (code ? `${base} (${code})` : base).slice(0, 200);
  }
  return String(err).slice(0, 200);
}
