import 'server-only';
import { and, eq } from 'drizzle-orm';
import { bugChatDataSchema } from '@/src/lib/bugs/chat-notice';
import { loadActorByUserId } from '@/src/server/auth/actor';
import { openSecret } from '@/src/server/crypto/sealed-secret';
import { db, type Tx } from '@/src/server/db/client';
import { bugReports, bugReportComments, bugReportStatusChanges } from '@/src/server/db/schema/bugs';
import { chatMessages, chatWebhooks, type ChatMessageRow } from '@/src/server/db/schema/chat';
import { serverEnv } from '@/src/server/env';
import type { ClaimedJob } from '@/src/server/jobs/outbox';
import { getSetting } from '@/src/server/settings/resolve';
import { revokeTokensForMessage } from './action-tokens';
import { isBugChatKind } from './model';
import { liveWebhookTransport, type WebhookTransport } from './webhook-client';
async function stale(tx: Tx, row: ChatMessageRow): Promise<boolean> {
  const payload = row.payload as { kind?: string; data?: unknown };
  const parsed = bugChatDataSchema.safeParse(payload.data);
  if (!parsed.success || payload.kind !== row.kind || !isBugChatKind(row.kind) || row.subjectType !== 'bug_report' || row.subjectId !== parsed.data.reportId || row.transport !== 'webhook') return true;
  const data = parsed.data;
  const [report] = await tx.select({ id: bugReports.id, reporterUserId: bugReports.reporterUserId }).from(bugReports).where(eq(bugReports.id, data.reportId)).limit(1);
  const actor = await loadActorByUserId(tx, row.recipientUserId);
  if (!report || !actor) return true;
  if (row.kind === 'bug_reported') return data.audience !== 'triager' || data.eventId !== report.id || report.reporterUserId === actor.userId || !actor.permissions.has('bugs.triage');
  if (data.audience !== 'reporter' || actor.userId !== report.reporterUserId || !actor.permissions.has('bugs.report')) return true;
  if (row.kind === 'bug_replied') {
    const [comment] = await tx.select({ reportId: bugReportComments.bugReportId, authorId: bugReportComments.authorUserId }).from(bugReportComments).where(eq(bugReportComments.id, data.eventId)).limit(1);
    return !comment || comment.reportId !== report.id || comment.authorId === report.reporterUserId;
  }
  const [change] = await tx.select({ reportId: bugReportStatusChanges.bugReportId, authorId: bugReportStatusChanges.changedByUserId, from: bugReportStatusChanges.fromStatus }).from(bugReportStatusChanges).where(eq(bugReportStatusChanges.id, data.eventId)).limit(1);
  return !change || change.reportId !== report.id || change.authorId === report.reporterUserId || change.from === null;
}
function card(row: ChatMessageRow): Record<string, unknown> {
  const payload = row.payload as { kind: string; data: unknown }, data = bugChatDataSchema.parse(payload.data);
  const title = ({ bug_reported: 'New bug report', bug_replied: 'Bug report reply', bug_status_changed: 'Bug report status changed' } as Record<string,string>)[row.kind];
  const status = { new: 'New', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled' }[data.status];
  const origin = new URL(process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');
  // APP_URL is a trusted deployment setting. Captured browser locations never build links.
  const url = new URL(`/bugs/${data.audience === 'reporter' ? 'mine/' : ''}${data.reportId}`, origin).toString();
  return { text: `${title} · ${data.summary} · ${status}`, cardsV2: [{ cardId: row.id, card: { header: { title, subtitle: data.summary }, sections: [{ widgets: [
    { decoratedText: { topLabel: 'Report', text: data.summary } }, { decoratedText: { topLabel: 'Status', text: status } },
    { buttonList: { buttons: [{ text: 'Open report', onClick: { openLink: { url } } }] } },
  ] }] } }] };
}
export async function handleChatMessageSend(job: ClaimedJob, now: Date, _provider?: unknown, dependencies: { transport?: WebhookTransport } = {}): Promise<void> {
  const transport = dependencies.transport ?? liveWebhookTransport;
  let failure: { retryAfterSeconds: number | null } | null = null;
  await db.transaction(async tx => {
    const id = job.payload.chatMessageId;
    if (typeof id !== 'string') throw new Error('chat_message_id_required');
    const [row] = await tx.select().from(chatMessages).where(eq(chatMessages.id, id)).for('update');
    if (!row || row.status === 'delivered' || row.status === 'superseded' || row.status === 'dead') return;
    const supersede = async (reason: string) => {
      await tx.update(chatMessages).set({ status: 'superseded', supersededAt: now, updatedAt: now, lastErrorClass: reason }).where(eq(chatMessages.id, id));
      await revokeTokensForMessage(tx, id, now);
    };
    if (row.transport !== 'webhook') { await supersede('bug_chat_requires_webhook'); return; }
    if (await getSetting(tx, 'chat_webhooks_paused', now)) { await supersede('webhook_delivery_paused'); return; }
    if (await stale(tx, row)) { await supersede('bug_chat_stale'); return; }
    const [webhook] = await tx.select().from(chatWebhooks).where(and(eq(chatWebhooks.id, row.webhookId!), eq(chatWebhooks.userId, row.recipientUserId))).for('share');
    if (!webhook || webhook.status !== 'active' || !webhook.encryptedUrl || webhook.credentialRevision !== row.webhookRevision || webhook.googleSpaceName !== row.spaceName) { await supersede('webhook_changed'); return; }
    let outcome: Awaited<ReturnType<WebhookTransport['send']>>;
    try {
      const url = new URL(openSecret(webhook.encryptedUrl, 'chat-webhook', row.recipientUserId, serverEnv.AUTH_SECRET));
      outcome = await transport.send({ url, body: card(row), messageId: row.id });
    } catch { outcome = { kind: 'retry', retryAfterSeconds: null }; }
    if (outcome.kind === 'accepted') await tx.update(chatMessages).set({ status: 'delivered', deliveredAt: now, updatedAt: now, externalMessageName: outcome.name, providerAppliedRevision: row.revision, lastErrorClass: null }).where(eq(chatMessages.id, id));
    else if (outcome.kind === 'rejected') await tx.update(chatMessages).set({ status: 'dead', lastErrorClass: 'webhook_rejected', updatedAt: now }).where(eq(chatMessages.id, id));
    else {
      await tx.update(chatMessages).set({ status: 'reconciliation_required', lastErrorClass: 'webhook_uncertain', updatedAt: now }).where(eq(chatMessages.id, id));
      failure = { retryAfterSeconds: outcome.retryAfterSeconds };
    }
  });
  // Commit retry state before surfacing failure to the durable worker.
  if (failure) throw Object.assign(new Error('webhook_retry_required'), failure);
}
export async function handleChatMessageUpdate(job: ClaimedJob, now: Date): Promise<void> {
  const id = job.payload.chatMessageId;
  if (typeof id === 'string') await db.update(chatMessages).set({ lastErrorClass: 'bug_chat_update_unsupported', updatedAt: now }).where(eq(chatMessages.id, id));
}
