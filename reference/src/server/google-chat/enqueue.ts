import 'server-only';
import { eq } from 'drizzle-orm';
import { bugChatDataSchema } from '@/src/lib/bugs/chat-notice';
import type { Tx } from '@/src/server/db/client';
import { chatMessages } from '@/src/server/db/schema/chat';
import { enqueueJob } from '@/src/server/jobs/outbox';
import { getSetting } from '@/src/server/settings/resolve';
import { chatDedupeKey, type BugChatMessageKind } from './model';
import { resolveChatDestination, type ChatDestination } from './recipients';
export type ChatCardPayload = { kind: BugChatMessageKind; data: ReturnType<typeof bugChatDataSchema.parse> };
export async function enqueueChatMessage(tx: Tx, input: {
  kind: BugChatMessageKind; recipientUserId: string; subjectType: 'bug_report'; subjectId: string | null;
  occurrence: string; payload: ChatCardPayload; destination?: ChatDestination; now: Date; correlationId: string;
}): Promise<{ chatMessageId: string | null; created: boolean }> {
  const data = bugChatDataSchema.parse(input.payload.data);
  if (input.payload.kind !== input.kind || input.subjectType !== 'bug_report' || input.subjectId !== data.reportId || input.occurrence !== data.eventId) throw new Error('bug_chat_subject_invalid');
  const destination = input.destination ?? await resolveChatDestination(tx, input.recipientUserId, { webhookOnly: true });
  if (!destination || destination.transport !== 'webhook') return { chatMessageId: null, created: false };
  const paused = await getSetting(tx, 'chat_webhooks_paused', input.now);
  const dedupeKey = chatDedupeKey(input.kind, input.subjectId, input.occurrence, input.recipientUserId);
  const [row] = await tx.insert(chatMessages).values({ dedupeKey, kind: input.kind, recipientUserId: input.recipientUserId,
    spaceName: destination.spaceName, transport: 'webhook', webhookId: destination.webhookId, webhookRevision: destination.webhookRevision,
    webhookIdempotency: destination.webhookIdempotency, subjectType: input.subjectType, subjectId: input.subjectId,
    notification: 'default', payload: input.payload, createdAt: input.now, updatedAt: input.now,
    ...(paused ? { status: 'superseded', supersededAt: input.now, lastErrorClass: 'webhook_delivery_paused' } : {}),
  }).onConflictDoNothing({ target: chatMessages.dedupeKey }).returning({ id: chatMessages.id });
  if (!row) { const [existing] = await tx.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.dedupeKey, dedupeKey)).limit(1); return { chatMessageId: existing.id, created: false }; }
  if (!paused) await enqueueJob(tx, { jobType: 'chat.message.send', aggregateType: 'chat_message', aggregateId: row.id,
    payload: { chatMessageId: row.id, correlationId: input.correlationId }, dedupeKey: `chat.message.send:${row.id}`, availableAt: input.now });
  return { chatMessageId: row.id, created: true };
}
