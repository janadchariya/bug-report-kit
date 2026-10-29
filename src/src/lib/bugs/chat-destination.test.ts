import { beforeEach, expect, it, vi } from 'vitest';
import type { DbOrTx } from '@/src/server/db/client';

vi.mock('server-only', () => ({}));
vi.mock('@/src/server/google-chat/provider', () => ({ getChatProvider: vi.fn(() => ({ mode: 'live' })) }));
import { getChatProvider } from '@/src/server/google-chat/provider';
import { resolveChatDestination } from '@/src/server/google-chat/recipients';

const id = '00000000-0000-4000-8000-000000000019';
function database(webhook: boolean): DbOrTx {
  const query = {
    from() { return this; }, leftJoin() { return this; }, where() { return this; },
    async limit() { return [{ spaceName: 'spaces/api', webhookId: webhook ? id : null, webhookSpaceName: 'spaces/personal', webhookRevision: 2, webhookIdempotency: 'message_id' }]; },
  };
  return { select: () => query } as unknown as DbOrTx;
}
beforeEach(() => vi.clearAllMocks());

it('skips API-only recipients without consulting the API provider in webhook-only mode', async () => {
  expect(await resolveChatDestination(database(false), id, { webhookOnly: true })).toBeNull();
  expect(getChatProvider).not.toHaveBeenCalled();
});
it('preserves personal webhook revision and the legacy API fallback for other callers', async () => {
  expect(await resolveChatDestination(database(true), id, { webhookOnly: true })).toEqual({ transport: 'webhook', spaceName: 'spaces/personal', webhookId: id, webhookRevision: 2, webhookIdempotency: 'message_id' });
  expect(getChatProvider).not.toHaveBeenCalled();
  expect(await resolveChatDestination(database(false), id)).toEqual({ transport: 'chat_api', spaceName: 'spaces/api' });
  expect(getChatProvider).toHaveBeenCalledOnce();
});
