import 'server-only';
import type { DbOrTx } from '@/src/server/db/client';
export async function getSetting(_db: DbOrTx, key: string, _at: Date): Promise<boolean> {
  return key === 'chat_webhooks_paused' && process.env.BUG_CHAT_PAUSED === 'true';
}
