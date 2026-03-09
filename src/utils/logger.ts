/**
 * Structured Logger — Minimal wrapper over console for pre-launch.
 *
 * Adds ISO timestamps, component context, and structured metadata.
 * Drop-in replacement for console.error/warn/log/debug — same API surface.
 *
 * Migration path: swap console methods for Pino/Winston when monitoring
 * infrastructure is set up. All call sites stay the same.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  ts: string;
  level: LogLevel;
  component: string;
  msg: string;
  data?: unknown;
}

function formatEntry(entry: LogEntry): string {
  const prefix = `[${entry.ts}] [${entry.level.toUpperCase()}] [${entry.component}]`;
  return entry.data !== undefined
    ? `${prefix} ${entry.msg} ${typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}`
    : `${prefix} ${entry.msg}`;
}

/**
 * Create a scoped logger for a specific component/module.
 *
 * Usage:
 *   const log = createLogger('ENGAGE');
 *   log.error('Session failed', { sessionId, error: err.message });
 *   log.warn('Budget exceeded');
 *   log.info('Session created', sessionId);
 */
export function createLogger(component: string) {
  const ts = () => new Date().toISOString();

  return {
    error(msg: string, data?: unknown) {
      const entry: LogEntry = { ts: ts(), level: 'error', component, msg, data };
      console.error(formatEntry(entry));
    },
    warn(msg: string, data?: unknown) {
      const entry: LogEntry = { ts: ts(), level: 'warn', component, msg, data };
      console.warn(formatEntry(entry));
    },
    info(msg: string, data?: unknown) {
      const entry: LogEntry = { ts: ts(), level: 'info', component, msg, data };
      console.log(formatEntry(entry));
    },
    debug(msg: string, data?: unknown) {
      if (process.env.SHEM_LOG_LEVEL !== 'debug') return;
      const entry: LogEntry = { ts: ts(), level: 'debug', component, msg, data };
      console.log(formatEntry(entry));
    },
  };
}
