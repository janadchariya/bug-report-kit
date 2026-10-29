import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, expect, it, vi } from 'vitest';
import { sealSecret } from '@/src/server/crypto/sealed-secret';
import { db } from '@/src/server/db/client';
import { bugReports } from '@/src/server/db/schema/bugs';
import { calendarEvents } from '@/src/server/db/schema/calendar';
import { calendarFeeds } from '@/src/server/db/schema/calendar-feeds';
import { chatMessages, chatSpaces, chatWebhooks, chatActionTokens } from '@/src/server/db/schema/chat';
import { outboxJobs } from '@/src/server/db/schema/jobs';
import { users } from '@/src/server/db/schema/users';
import { serverEnv } from '@/src/server/env';
import { handleChatMessageSend, handleChatMessageUpdate } from '@/src/server/google-chat/deliver-job';
import { BUG_CHAT_MESSAGE_KINDS } from '@/src/server/google-chat/model';
import { issueChatActionToken } from '@/src/server/google-chat/action-tokens';
import { getChatProvider } from '@/src/server/google-chat/provider';
import type { WebhookTransport } from '@/src/server/google-chat/webhook-client';
import type { ClaimedJob } from '@/src/server/jobs/outbox';
import { buildTestActor } from '@/tests/fixtures/actor';
import { createUser } from '@/tests/fixtures/factories';
import { setRolePermissions } from '@/tests/fixtures/role-permissions';
import { truncateAll } from '@/tests/setup/truncate';
import { addBugComment, createBug, updateBug } from './commands';

vi.mock('@/src/server/google-chat/provider', () => ({ getChatProvider: vi.fn(() => { throw new Error('API provider must stay dormant'); }) }));
vi.mock('@/src/server/notify/notify', () => ({ notify: vi.fn(async () => {}) }));
vi.mock('@/src/server/settings/resolve', async (original) => ({ ...await original<object>(), getSetting: async (_db: unknown, key: string, at: Date) => { if (key === 'chat_webhooks_paused') pauseReadTimes.push(at); return paused; } }));
let paused = false;
const pauseReadTimes: Date[] = [];
beforeEach(async () => { await truncateAll(); paused = false; pauseReadTimes.length = 0; vi.mocked(getChatProvider).mockClear(); });
const now = new Date('2026-10-27T02:00:00Z');
const correlationId = 'r19-notice-test';
const context = { pagePath: '/today', pageQuery: '', viewportWidth: 800, viewportHeight: 600, userAgent: 'synthetic', osName: null, osVersion: null, browserName: null, browserVersion: null, deviceType: null, appBuildSha: null };
const actor = async (roles: NonNullable<Parameters<typeof createUser>[0]>['roles']) => buildTestActor((await createUser({ roles })).id);
async function webhook(userId: string, status: 'active' | 'broken' | 'disabled' = 'active', url = 'https://chat.example.test/v1/spaces/synthetic/messages?key=fake-key&token=fake-token') {
  const [row] = await db.insert(chatWebhooks).values({ userId, status, encryptedUrl: status === 'disabled' ? null : sealSecret(url, 'chat-webhook', userId, serverEnv.AUTH_SECRET), googleSpaceName: 'spaces/synthetic', verifiedAt: now }).returning();
  return row;
}
const report = (reporter: Awaited<ReturnType<typeof actor>>, requestId = randomUUID()) => db.transaction(tx => createBug(tx, { actor: reporter, input: { requestId, summary: 'Customer SyntheticCustomer <b>0800000000 customer@example.test</b>', description: 'private description' }, context, now, correlationId }));
const messages = () => db.select().from(chatMessages);
const job = (id: string, attemptCount = 1): ClaimedJob => ({ id: randomUUID(), jobType: 'chat.message.send', aggregateType: 'chat_message', aggregateId: id, payload: { chatMessageId: id }, dedupeKey: id, attemptCount, leaseOwner: 'test', leaseExpiresAt: now.toISOString() });
const transport = (): WebhookTransport & { send: ReturnType<typeof vi.fn<WebhookTransport['send']>> } => ({ mode: 'synthetic', send: vi.fn(async () => ({ kind: 'accepted', name: 'spaces/synthetic/messages/accepted' })) });

it('fans out only to active effective triagers with personal webhooks and deduplicates report retries', async () => {
  const reporter = await actor(['bd']); const md = await actor(['md']); const delegated = await actor(['am']);
  const noWebhook = await actor(['md']); const broken = await actor(['md']); const disabled = await actor(['md']); const inactive = await actor(['md']);
  await setRolePermissions({ am: { 'bugs.triage': true } });
  for (const user of [reporter, md, delegated, inactive]) await webhook(user.userId);
  await webhook(broken.userId, 'broken'); await webhook(disabled.userId, 'disabled');
  await db.update(users).set({ status: 'inactive' }).where(eq(users.id, inactive.userId));
  await db.insert(chatSpaces).values({ userId: noWebhook.userId, status: 'active', googleSpaceName: 'spaces/api-only' });
  const requestId = randomUUID(); const saved = await report(reporter, requestId); expect(await report(reporter, requestId)).toEqual(saved);
  const rows = await messages();
  expect(rows.map(row => row.recipientUserId).sort()).toEqual([md.userId, delegated.userId].sort());
  expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'bug_reported', subjectType: 'bug_report', subjectId: saved.id, notification: 'default', transport: 'webhook', webhookRevision: 1 })]));
  expect(await db.select().from(outboxJobs)).toHaveLength(2);
  expect(JSON.stringify(rows)).not.toMatch(/SyntheticCustomer|0800000000|customer@example|private description|<b>/);
  expect(rows[0].payload.data).toEqual({ reportId: saved.id, eventId: saved.id, summary: `Bug report ${saved.id.slice(0, 8)}`, status: 'new', audience: 'triager' });
  expect(getChatProvider).not.toHaveBeenCalled();
});

it('replies and real status changes notify only the reporter, with stable event dedupe and no self or metadata-only notices', async () => {
  const reporter = await actor(['bd']); const md = await actor(['md']); await webhook(reporter.userId); await webhook(md.userId);
  const saved = await report(reporter); const requestId = randomUUID();
  const reply = () => db.transaction(tx => addBugComment(tx, { actor: md, bugId: saved.id, input: { requestId, body: 'private reply' }, now, correlationId }));
  const comment = await reply(); expect(await reply()).toEqual(comment);
  await db.transaction(tx => addBugComment(tx, { actor: reporter, bugId: saved.id, input: { requestId: randomUUID(), body: 'own reply' }, now, correlationId }));
  const change = (version: number, patch: Parameters<typeof updateBug>[1]['patch']) => db.transaction(tx => updateBug(tx, { actor: md, bugId: saved.id, expectedVersion: version, patch, now, correlationId }));
  await change(1, { status: 'new' }); await change(1, { priority: 'high', assignedToUserId: md.userId }); await change(2, { status: 'in_progress' }); await change(3, { status: 'done' });
  const rows = (await messages()).filter(row => row.recipientUserId === reporter.userId);
  expect(rows.map(row => row.kind)).toEqual(['bug_replied', 'bug_status_changed', 'bug_status_changed']);
  expect(rows[0].payload.data).toMatchObject({ reportId: saved.id, eventId: comment.comment.id, audience: 'reporter' });
  expect(rows[2].payload.data).toMatchObject({ status: 'done' });
  expect(new Set(rows.map(row => row.dedupeKey)).size).toBe(3);
  expect(JSON.stringify(rows)).not.toMatch(/private reply|own reply/);
  const own = await report(md); await db.transaction(tx => addBugComment(tx, { actor: md, bugId: own.id, input: { requestId: randomUUID(), body: 'own' }, now, correlationId }));
  await db.transaction(tx => updateBug(tx, { actor: md, bugId: own.id, expectedVersion: 1, patch: { status: 'in_progress' }, now, correlationId }));
  expect((await messages()).filter(row => row.subjectId === own.id)).toHaveLength(0);
});

it.each(['bug_replied', 'bug_status_changed'] as const)('delivers %s to the reporter webhook with a trusted Mine link', async kind => {
  const reporter = await actor(['bd']); const md = await actor(['md']);
  const reporterWebhookUrl = 'https://chat.example.test/v1/spaces/synthetic/messages?key=reporter-key&token=reporter-token';
  const reporterWebhook = await webhook(reporter.userId, 'active', reporterWebhookUrl);
  await webhook(md.userId);
  const saved = await report(reporter);
  if (kind === 'bug_replied') {
    await db.transaction(tx => addBugComment(tx, { actor: md, bugId: saved.id, input: { requestId: randomUUID(), body: 'private reply' }, now, correlationId }));
  } else {
    await db.transaction(tx => updateBug(tx, { actor: md, bugId: saved.id, expectedVersion: 1, patch: { status: 'in_progress' }, now, correlationId }));
  }
  const rows = (await messages()).filter(row => row.kind === kind);
  expect(rows).toMatchObject([{ recipientUserId: reporter.userId, webhookId: reporterWebhook.id, transport: 'webhook', subjectId: saved.id, status: 'pending' }]);
  const [row] = rows;
  const http = transport(); await handleChatMessageSend(job(row.id), now, undefined, { transport: http });
  expect(http.send).toHaveBeenCalledTimes(1);
  const [request] = http.send.mock.calls[0];
  expect(String(request.url)).toBe(reporterWebhookUrl);
  const body = JSON.stringify(request.body);
  expect(body).toContain(JSON.stringify({ openLink: { url: `https://crm.test/bugs/mine/${saved.id}` } }));
  expect(body).not.toMatch(/SyntheticCustomer|0800000000|customer@example|private|<b>|"action":/);
  expect((await messages()).find(message => message.id === row.id)).toMatchObject({ status: 'delivered', deliveredAt: now });
  expect(await db.select().from(chatActionTokens)).toHaveLength(0);
  expect(getChatProvider).not.toHaveBeenCalled();
});

it('does not enqueue reporter notices without a usable personal webhook', async () => {
  const reporter = await actor(['bd']); const md = await actor(['md']); const saved = await report(reporter);
  await db.insert(chatSpaces).values({ userId: reporter.userId, status: 'active', googleSpaceName: 'spaces/api-only' });
  await db.transaction(tx => addBugComment(tx, { actor: md, bugId: saved.id, input: { requestId: randomUUID(), body: 'reply' }, now, correlationId }));
  await db.transaction(tx => updateBug(tx, { actor: md, bugId: saved.id, expectedVersion: 1, patch: { status: 'in_progress' }, now, correlationId }));
  expect(await messages()).toHaveLength(0);
  expect(getChatProvider).not.toHaveBeenCalled();
});

it('respects pause at enqueue and at delivery without creating a new job kind or fallback', async () => {
  const reporter = await actor(['bd']); const md = await actor(['md']); await webhook(md.userId);
  paused = true; await report(reporter);
  expect(await messages()).toMatchObject([{ status: 'superseded', lastErrorClass: 'webhook_delivery_paused' }]);
  expect(await db.select().from(outboxJobs)).toHaveLength(0);
  paused = false; const saved = await report(reporter); const row = (await messages()).find(row => row.subjectId === saved.id)!;
  paused = true; const http = transport(); await handleChatMessageSend(job(row.id), now, undefined, { transport: http });
  expect(http.send).not.toHaveBeenCalled();
  expect((await messages()).find(message => message.id === row.id)).toMatchObject({ status: 'superseded', lastErrorClass: 'webhook_delivery_paused' });
});

it('evaluates enqueue pause against current time even when a status event carries an old timestamp', async () => {
  const reporter = await actor(['bd']); const md = await actor(['md']); await webhook(reporter.userId); const saved = await report(reporter);
  const before = Date.now();
  await db.transaction(tx => updateBug(tx, { actor: md, bugId: saved.id, expectedVersion: 1, patch: { status: 'in_progress' }, now: new Date('2020-01-01T00:00:00Z'), correlationId }));
  expect(pauseReadTimes).toHaveLength(1);
  expect(pauseReadTimes[0].getTime()).toBeGreaterThanOrEqual(before);
  expect(pauseReadTimes[0].getTime()).toBeLessThanOrEqual(Date.now());
});

it.each(['permission', 'inactive', 'replaced', 'removed'] as const)('supersedes a queued triager notice after %s revocation', async cause => {
  const reporter = await actor(['bd']); const md = await actor(['md']); const credential = await webhook(md.userId); await report(reporter);
  const [row] = await messages();
  if (cause === 'permission') await setRolePermissions({ md: { 'bugs.triage': false } });
  if (cause === 'inactive') await db.update(users).set({ status: 'inactive' }).where(eq(users.id, md.userId));
  if (cause === 'replaced') await db.update(chatWebhooks).set({ credentialRevision: 2 }).where(eq(chatWebhooks.id, credential.id));
  if (cause === 'removed') await db.update(chatWebhooks).set({ status: 'disabled', encryptedUrl: null }).where(eq(chatWebhooks.id, credential.id));
  const http = transport(); await handleChatMessageSend(job(row.id), now, undefined, { transport: http });
  expect(http.send).not.toHaveBeenCalled(); expect((await messages())[0].status).toBe('superseded');
});

it.each(['inactive', 'permission'] as const)('rechecks reporter parent visibility after %s revocation', async cause => {
  const reporter = await actor(['bd']); const md = await actor(['md']); await webhook(reporter.userId); const saved = await report(reporter);
  await db.transaction(tx => addBugComment(tx, { actor: md, bugId: saved.id, input: { requestId: randomUUID(), body: 'reply' }, now, correlationId }));
  const [row] = await messages();
  if (cause === 'inactive') await db.update(users).set({ status: 'inactive' }).where(eq(users.id, reporter.userId));
  else await setRolePermissions({ bd: { 'bugs.report': false } });
  const http = transport(); await handleChatMessageSend(job(row.id), now, undefined, { transport: http });
  expect(http.send).not.toHaveBeenCalled(); expect((await messages())[0].status).toBe('superseded');
});

it('requires the Mine permission for reporter links even when the reporter retains delegated triage', async () => {
  const reporter = await actor(['md']); const other = await actor(['md']); await webhook(reporter.userId);
  const saved = await report(reporter);
  const reply = () => db.transaction(tx => addBugComment(tx, { actor: other, bugId: saved.id, input: { requestId: randomUUID(), body: 'reply' }, now, correlationId }));
  await reply(); const [pending] = await messages(); expect(pending.kind).toBe('bug_replied');
  await setRolePermissions({ md: { 'bugs.report': false } });
  await reply(); expect(await messages()).toHaveLength(1);
  const http = transport(); await handleChatMessageSend(job(pending.id), now, undefined, { transport: http });
  expect(http.send).not.toHaveBeenCalled(); expect((await messages())[0].status).toBe('superseded');
});

it('delivers only fallback/status/trusted links and never creates tokens or PATCH repair jobs', async () => {
  const reporter = await actor(['bd']); const md = await actor(['md']); await webhook(md.userId); const saved = await report(reporter); const [row] = await messages();
  const http = transport(); await handleChatMessageSend(job(row.id), now, undefined, { transport: http });
  const body = JSON.stringify(http.send.mock.calls[0][0].body);
  expect(body).toContain(`Bug report ${saved.id.slice(0, 8)}`); expect(body).toContain(`https://crm.test/bugs/${saved.id}`);
  expect(body).not.toMatch(/SyntheticCustomer|0800000000|customer@example|private|<b>|"action":/);
  await handleChatMessageUpdate({ ...job(row.id), jobType: 'chat.message.update', payload: { chatMessageId: row.id, revision: 1 } }, now);
  expect(http.send).toHaveBeenCalledTimes(1); expect(await db.select().from(chatActionTokens)).toHaveLength(0);
  expect((await db.select().from(outboxJobs)).every(row => row.jobType === 'chat.message.send')).toBe(true);
});

it('keeps a saved report and its outbox work through a throwing or timed-out delivery and deduplicates retry', async () => {
  const reporter = await actor(['bd']); const md = await actor(['md']); await webhook(md.userId); const saved = await report(reporter); const [row] = await messages();
  const http: WebhookTransport = { mode: 'synthetic', send: async () => { throw new Error('synthetic timeout'); } };
  await expect(handleChatMessageSend(job(row.id), now, undefined, { transport: http })).rejects.toMatchObject({ retryAfterSeconds: null });
  expect(await db.select().from(bugReports)).toHaveLength(1); expect((await messages())[0]).toMatchObject({ status: 'reconciliation_required' });
  const retry = transport(); await handleChatMessageSend(job(row.id, 2), now, undefined, { transport: retry });
  expect((await messages())[0]).toMatchObject({ status: 'delivered', subjectId: saved.id });
});

it('refuses API delivery of a bug row before resolving any dormant provider', async () => {
  const reporter = await actor(['bd']); const md = await actor(['md']); await webhook(md.userId); await report(reporter);
  const [row] = await messages();
  await db.update(chatMessages).set({ transport: 'chat_api', webhookId: null, webhookRevision: null }).where(eq(chatMessages.id, row.id));
  await db.transaction(tx => issueChatActionToken(tx, { purpose: 'contact.log', subjectType: 'lead', subjectId: randomUUID(), issuedForUserId: md.userId, chatMessageId: row.id, now }));
  await handleChatMessageSend(job(row.id), now);
  expect((await messages())[0]).toMatchObject({ status: 'superseded', lastErrorClass: 'bug_chat_requires_webhook' });
  expect(await db.select().from(chatActionTokens)).toMatchObject([{ revokedAt: now }]);
  await handleChatMessageUpdate({ ...job(row.id), jobType: 'chat.message.update', payload: { chatMessageId: row.id, revision: 1 } }, now);
});

it('does not deliver a forged parent/event or audience to a recipient', async () => {
  const reporter = await actor(['bd']); const md = await actor(['md']); await webhook(md.userId); await report(reporter); const [row] = await messages();
  const payload = row.payload as { kind: 'bug_reported'; data: Record<string, unknown> };
  await db.update(chatMessages).set({ payload: { ...payload, data: { ...payload.data, audience: 'reporter' } } }).where(eq(chatMessages.id, row.id));
  const http = transport(); await handleChatMessageSend(job(row.id), now, undefined, { transport: http });
  expect(http.send).not.toHaveBeenCalled(); expect((await messages())[0].status).toBe('superseded');
});

it('widens only Chat CHECKs over retained R18 webhook/message/calendar rows', async () => {
  const previous = JSON.parse(readFileSync('tests/fixtures/pre-bug-chat-checks.json', 'utf8'));
  const sqlText = readFileSync('db/migrations/0002_bug_chat.sql', 'utf8');
  await expect(db.transaction(async tx => {
    const user = await createUser({ roles: ['bd'] });
    const [hook] = await tx.insert(chatWebhooks).values({ userId: user.id, status: 'active', encryptedUrl: 'synthetic-sealed', googleSpaceName: 'spaces/retained', verifiedAt: now }).returning();
    const [feed] = await tx.insert(calendarFeeds).values({ userId: user.id, tokenHash: 'c'.repeat(64), encryptedToken: 'synthetic-sealed' }).returning();
    const [calendar] = await tx.insert(calendarEvents).values({ ownerUserId: user.id, subjectType: 'follow_up', subjectId: randomUUID(), googleEventId: 'retained', summary: 'synthetic', startAt: now, endAt: now }).returning();
    for (const name of ['chat_messages_kind_known', 'chat_messages_subject_type_known']) {
      await tx.execute(sql.raw(`ALTER TABLE chat_messages DROP CONSTRAINT "${name}"`));
      await tx.execute(sql.raw(`ALTER TABLE chat_messages ADD CONSTRAINT "${name}" CHECK (${previous.tables['public.chat_messages'].checkConstraints[name].value})`));
    }
    const oldKinds = [...previous.tables['public.chat_messages'].checkConstraints.chat_messages_kind_known.value.matchAll(/'([^']+)'/g)].map((match: RegExpMatchArray) => match[1]);
    const oldSubjects = [...previous.tables['public.chat_messages'].checkConstraints.chat_messages_subject_type_known.value.matchAll(/'([^']+)'/g)].map((match: RegExpMatchArray) => match[1]);
    const insert = (kind: string, subjectType: string, session = tx) => session.insert(chatMessages).values({ dedupeKey: randomUUID(), kind, recipientUserId: user.id, spaceName: 'spaces/retained', subjectType, notification: 'default', payload: {}, transport: 'webhook', webhookId: hook.id, webhookRevision: 1 }).returning();
    for (const kind of oldKinds) await insert(kind, 'digest');
    for (const subject of oldSubjects) await insert('space_bind', subject);
    const retained = await tx.select().from(chatMessages).orderBy(chatMessages.id);
    await expect(tx.transaction(inner => insert('bug_reported', 'bug_report', inner))).rejects.toThrow();
    for (const statement of sqlText.split('--> statement-breakpoint').map(part => part.trim()).filter(Boolean)) await tx.execute(sql.raw(statement));
    expect(await tx.select().from(chatMessages).orderBy(chatMessages.id)).toEqual(retained);
    expect(await tx.select().from(chatWebhooks)).toEqual([hook]); expect(await tx.select().from(calendarFeeds)).toEqual([feed]); expect(await tx.select().from(calendarEvents)).toEqual([calendar]);
    for (const kind of BUG_CHAT_MESSAGE_KINDS) await insert(kind, 'bug_report');
    await expect(tx.transaction(inner => insert('unknown_kind', 'bug_report', inner))).rejects.toThrow();
    await expect(tx.transaction(inner => insert('bug_reported', 'unknown_subject', inner))).rejects.toThrow();
    tx.rollback();
  })).rejects.toThrow('Rollback');
});
