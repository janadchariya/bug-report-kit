import 'server-only';
import postgres from 'postgres';
export const DEFAULT_POOL_MAX = 2;
export const IDLE_TIMEOUT_SECONDS = 5;
export function createSqlClient(url: string, max = DEFAULT_POOL_MAX): ReturnType<typeof postgres> {
  return postgres(url, { max, idle_timeout: IDLE_TIMEOUT_SECONDS, max_lifetime: 300, prepare: false, onnotice: () => undefined });
}
