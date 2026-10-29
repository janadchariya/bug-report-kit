import 'server-only';
import { eq } from 'drizzle-orm';
import { makeBugChatData } from '@/src/lib/bugs/chat-notice';
import { loadActorByUserId } from '@/src/server/auth/actor';
import type { Tx } from '@/src/server/db/client';
import { bugReports } from '@/src/server/db/schema/bugs';
import { enqueueChatMessage } from '@/src/server/google-chat/enqueue';
import type { BugChatMessageKind } from '@/src/server/google-chat/model';
import { resolveChatDestination } from '@/src/server/google-chat/recipients';
import { listActiveBugTriagers } from './access';

/** Called inside the business transaction, after the event has its permanent identity. */
export async function enqueueBugNotification(tx: Tx, input: {
  kind: BugChatMessageKind; reportId: string; eventId: string; actorUserId: string; correlationId: string;
}): Promise<void> {
  // No source text is fetched here, including the report's summary or screenshot.
  const [report] = await tx.select({ id: bugReports.id, reporterUserId: bugReports.reporterUserId, status: bugReports.status })
    .from(bugReports).where(eq(bugReports.id, input.reportId)).limit(1);
  if (!report) throw new Error('bug_notification_parent_missing');
  const recipients = input.kind === 'bug_reported'
    ? (await listActiveBugTriagers(tx)).map(user => user.id)
    : [report.reporterUserId];
  for (const userId of recipients) {
    if (userId === input.actorUserId) continue;
    const actor = await loadActorByUserId(tx, userId);
    if (!actor || (input.kind === 'bug_reported' ? !actor.permissions.has('bugs.triage') : !actor.permissions.has('bugs.report'))) continue;
    const destination = await resolveChatDestination(tx, userId, { webhookOnly: true });
    if (!destination || destination.transport !== 'webhook') continue;
    await enqueueChatMessage(tx, {
      kind: input.kind, recipientUserId: userId, subjectType: 'bug_report', subjectId: report.id, occurrence: input.eventId,
      payload: { kind: input.kind, data: makeBugChatData({ reportId: report.id, eventId: input.eventId, status: report.status, audience: input.kind === 'bug_reported' ? 'triager' : 'reporter' }) },
      // Pause is an operational switch evaluated now, never at a historical event timestamp.
      destination, now: new Date(), correlationId: input.correlationId,
    });
  }
}
