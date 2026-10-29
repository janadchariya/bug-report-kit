import 'server-only';
export type WebhookOutcome = { kind: 'accepted'; name: string } | { kind: 'retry'; retryAfterSeconds: number | null } | { kind: 'rejected' };
export type WebhookTransport = { mode: 'live' | 'synthetic'; send(input: { url: URL; body: Record<string, unknown>; messageId: string }): Promise<WebhookOutcome> };
export const liveWebhookTransport: WebhookTransport = { mode: 'live', async send({ url, body, messageId }) {
  // Only the live transport performs URL validation. Tests inject a synthetic transport.
  if (url.protocol !== 'https:' || url.hostname !== 'chat.googleapis.com' || !/^\/v1\/spaces\/[^/]+\/messages$/.test(url.pathname) || !url.searchParams.has('key') || !url.searchParams.has('token')) throw new Error('invalid_webhook_url');
  const target = new URL(url); target.searchParams.set('messageId', `client-${messageId}`);
  const response = await fetch(target, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  if (response.ok) { const data = await response.json() as { name?: unknown }; if (typeof data.name !== 'string') return { kind: 'retry', retryAfterSeconds: null }; return { kind: 'accepted', name: data.name }; }
  if (response.status === 429 || response.status >= 500) return { kind: 'retry', retryAfterSeconds: null };
  return { kind: 'rejected' };
} };
