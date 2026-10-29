import 'server-only';
import { assertNoSensitiveField } from './redact';
export interface LogFields { readonly event: string; readonly correlationId?: string; readonly [key: string]: unknown }
function write(level: 'info' | 'warn' | 'error' | 'debug', fields: LogFields): void {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) { try { assertNoSensitiveField({ [key]: value }); safe[key] = value; } catch { safe[key] = '[redacted]'; } }
  const line = JSON.stringify({ ...safe, level, at: new Date().toISOString() });
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`); else process.stdout.write(`${line}\n`);
}
export const logger = { debug: (f: LogFields) => write('debug', f), info: (f: LogFields) => write('info', f), warn: (f: LogFields) => write('warn', f), error: (f: LogFields) => write('error', f) };
