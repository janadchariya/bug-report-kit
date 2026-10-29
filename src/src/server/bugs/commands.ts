import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { BUG_STATUSES, canTransitionBugStatus } from '@/src/domain/bugs';
import type { BugComment, BugImageMeta } from '@/src/lib/bugs/types';
import { bugReasonSchema, markBugReadInputSchema, updateBugInputSchema } from '@/src/lib/bugs/input';
import type { Actor } from '@/src/server/auth/actor';
import { loadActorByUserId } from '@/src/server/auth/actor';
import { assertCan } from '@/src/server/auth/permissions';
import type { Tx } from '@/src/server/db/client';
import { bugReports, bugReportComments, bugReportFiles, bugReportImages, bugReportStatusChanges, type BugReportImageRow } from '@/src/server/db/schema/bugs';
import { DomainRuleError, StaleStateError, ValidationError } from '@/src/server/errors';
import { actorRef, appendEvent } from '@/src/server/events/append';
import type { EventType } from '@/src/server/events/types';
import { requireBugActor, requireVisibleBug } from './access';
import type { BugCreateContext } from './context';
import type { validateBugImage } from './images';
import { lockBugQuota, checkBugQuota, checkBugImageQuota } from './rate-limit';
import { enqueueBugNotification } from './notifications';
import { bugPdfFields, toBugPdfMeta } from './files';

type Image = NonNullable<Awaited<ReturnType<typeof validateBugImage>>>;
type Mutation = { actor: Actor; now: Date; correlationId: string };
// Under the report lock, order all thread activity by the database clock with
// microsecond precision, even if this request waited behind newer writes.
function activityTimestamp(reportId: string) {
  return sql`greatest(clock_timestamp(),
    coalesce((select max(created_at) from public.bug_report_comments where bug_report_id = ${reportId}), '-infinity'::timestamptz) + interval '1 microsecond',
    coalesce((select max(created_at) from public.bug_report_status_changes where bug_report_id = ${reportId}), '-infinity'::timestamptz) + interval '1 microsecond')`;
}

const reportInput = z.strictObject({ requestId: z.uuid(), summary: z.string().trim().min(1).max(200), description: z.string().trim().max(4000).nullable().optional() });
const commentInput = z.strictObject({ requestId: z.uuid(), body: z.string().trim().max(4000).nullable().optional(), pendingPdf: z.literal(true).optional() });
function parsed<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError([{ path: 'bug', code: 'invalid_bug_input' }]);
  return result.data;
}
function imageMeta(row: BugReportImageRow): BugImageMeta {
  return { id: row.id, kind: row.kind, mimeType: row.mimeType, width: row.width, height: row.height, byteCount: row.byteCount, removed: row.removedAt !== null, url: row.removedAt ? null : `/api/bugs/images/${row.id}` };
}
async function audit(tx: Tx, type: EventType, reportId: string, actor: Actor, at: Date, correlationId: string, payload: Record<string, unknown> = {}) {
  await appendEvent(tx, { type, subjectType: 'bug_report', subjectId: reportId, actor: actorRef(actor), occurredAt: at, correlationId, payload });
}
async function attach(tx: Tx, actor: Actor, reportId: string, image: Image, commentId?: string) {
  // Storage quota uses the real upload clock, independently of a thread's
  // monotonically adjusted activity timestamp or the request's application clock.
  const [row] = await tx.insert(bugReportImages).values({ bugReportId: reportId, commentId: commentId ?? null, kind: commentId ? 'comment' : 'screenshot', ...image, uploadedByUserId: actor.userId, createdAt: sql`clock_timestamp()` }).returning();
  return imageMeta(row);
}
export async function createBug(tx: Tx, args: Mutation & { input: z.infer<typeof reportInput>; context: BugCreateContext; image?: Image | null }): Promise<{ id: string }> {
  const actor = await requireBugActor(tx, args.actor);
  assertCan(actor, 'bugs.report');
  const input = parsed(reportInput, args.input);
  const now = await lockBugQuota(tx, actor.userId, 'report');
  assertCan(await requireBugActor(tx, actor), 'bugs.report');
  const [replay] = await tx.select({ id: bugReports.id }).from(bugReports).where(and(eq(bugReports.reporterUserId, actor.userId), eq(bugReports.requestId, input.requestId))).limit(1);
  if (replay) return replay;
  await checkBugQuota(tx, actor.userId, 'report');
  await checkBugImageQuota(tx, actor.userId, args.image?.byteCount ?? 0);
  const [report] = await tx.insert(bugReports).values({ ...args.context, reporterUserId: actor.userId, requestId: input.requestId, summary: input.summary, description: input.description || null, createdAt: now, updatedAt: now }).returning({ id: bugReports.id });
  await tx.insert(bugReportStatusChanges).values({ bugReportId: report.id, changedByUserId: actor.userId, fromStatus: null, toStatus: 'new', createdAt: now });
  if (args.image) await attach(tx, actor, report.id, args.image);
  await audit(tx, 'bug.reported', report.id, actor, now, args.correlationId);
  await enqueueBugNotification(tx, { kind: 'bug_reported', reportId: report.id, eventId: report.id, actorUserId: actor.userId, correlationId: args.correlationId });
  return report;
}
export async function addBugComment(tx: Tx, args: Mutation & { bugId: string; input: z.infer<typeof commentInput>; image?: Image | null }): Promise<{ comment: BugComment; activitySeq: number }> {
  const actor = await requireBugActor(tx, args.actor);
  const input = parsed(commentInput, args.input);
  if ((!input.body && !args.image && !input.pendingPdf) || (args.image && input.pendingPdf)) throw new ValidationError([{ path: 'body', code: 'bug_comment_empty' }]);
  await lockBugQuota(tx, actor.userId, 'comment');
  const [replay] = await tx.select().from(bugReportComments).where(and(eq(bugReportComments.authorUserId, actor.userId), eq(bugReportComments.requestId, input.requestId))).limit(1);
  if (replay && replay.bugReportId !== args.bugId) throw new DomainRuleError('bug_request_reused');
  const report = await requireVisibleBug(tx, { actor, bugId: args.bugId, forUpdate: true });
  if (replay) {
    const [image] = await tx.select({ id: bugReportImages.id, kind: bugReportImages.kind, mimeType: bugReportImages.mimeType, width: bugReportImages.width, height: bugReportImages.height, byteCount: bugReportImages.byteCount, removedAt: bugReportImages.removedAt }).from(bugReportImages).where(eq(bugReportImages.commentId, replay.id)).limit(1);
    const [pdf] = await tx.select(bugPdfFields).from(bugReportFiles).where(eq(bugReportFiles.commentId, replay.id)).limit(1);
    return { comment: { id: replay.id, isMine: true, authorUserId: replay.authorUserId, body: replay.body, pendingPdf: replay.pendingPdf, pdf: pdf ? toBugPdfMeta(pdf) : null, createdAt: replay.createdAt.toISOString(), image: image ? { id: image.id, kind: image.kind, mimeType: image.mimeType, width: image.width, height: image.height, byteCount: image.byteCount, removed: !!image.removedAt, url: image.removedAt ? null : `/api/bugs/images/${image.id}` } : null }, activitySeq: replay.reporterActivitySeq };
  }
  await checkBugQuota(tx, actor.userId, 'comment');
  await checkBugImageQuota(tx, actor.userId, args.image?.byteCount ?? 0);
  const activitySeq = report.reporterActivitySeq + (actor.userId !== report.reporterUserId && actor.permissions.has('bugs.triage') ? 1 : 0);
  const [comment] = await tx.insert(bugReportComments).values({ bugReportId: report.id, authorUserId: actor.userId, requestId: input.requestId, body: input.body || null, pendingPdf: !!input.pendingPdf, reporterActivitySeq: activitySeq, createdAt: activityTimestamp(report.id) }).returning();
  const now = comment.createdAt;
  const image = args.image ? await attach(tx, actor, report.id, args.image, comment.id) : null;
  await tx.update(bugReports).set({ reporterActivitySeq: activitySeq, updatedAt: now }).where(eq(bugReports.id, report.id));
  await audit(tx, 'bug.commented', report.id, actor, now, args.correlationId, { commentId: comment.id });
  if (actor.permissions.has('bugs.triage') && actor.userId !== report.reporterUserId) await enqueueBugNotification(tx, { kind: 'bug_replied', reportId: report.id, eventId: comment.id, actorUserId: actor.userId, correlationId: args.correlationId });
  return { comment: { id: comment.id, isMine: true, authorUserId: actor.userId, body: comment.body, pendingPdf: comment.pendingPdf, pdf: null, createdAt: comment.createdAt.toISOString(), image }, activitySeq };
}
export async function updateBug(tx: Tx, args: Mutation & z.infer<typeof updateBugInputSchema>): Promise<{ id: string; version: number; status: typeof BUG_STATUSES[number] }> {
  const actor = await requireBugActor(tx, args.actor);
  assertCan(actor, 'bugs.triage');
  const { patch, expectedVersion, reason } = parsed(updateBugInputSchema, { bugId: args.bugId, expectedVersion: args.expectedVersion, patch: args.patch, ...(args.reason === undefined ? {} : { reason: args.reason }) });
  const report = await requireVisibleBug(tx, { actor, bugId: args.bugId, forUpdate: true });
  assertCan(await requireBugActor(tx, actor), 'bugs.triage');
  if (report.version !== expectedVersion) throw new StaleStateError(report.version);
  const status = patch.status ?? report.status;
  const priority = patch.priority === undefined ? report.priority : patch.priority;
  const assignedToUserId = patch.assignedToUserId === undefined ? report.assignedToUserId : patch.assignedToUserId;
  const statusChanged = status !== report.status;
  if (statusChanged && !canTransitionBugStatus(report.status, status)) throw new DomainRuleError('bug_transition_invalid');
  const cancellationReason = statusChanged && status === 'cancelled' ? parsed(bugReasonSchema, reason) : null;
  if (patch.assignedToUserId) {
    const assignee = await loadActorByUserId(tx, patch.assignedToUserId);
    if (!assignee?.permissions.has('bugs.triage')) throw new DomainRuleError('bug_assignee_unavailable');
  }
  if (!statusChanged && priority === report.priority && assignedToUserId === report.assignedToUserId) return { id: report.id, version: report.version, status: report.status };
  const version = report.version + 1;
  await tx.update(bugReports).set({ status, priority, assignedToUserId, version, updatedAt: sql`clock_timestamp()`, reporterActivitySeq: report.reporterActivitySeq + (statusChanged && actor.userId !== report.reporterUserId ? 1 : 0) }).where(eq(bugReports.id, report.id));
  if (statusChanged) {
    const [change] = await tx.insert(bugReportStatusChanges).values({ bugReportId: report.id, changedByUserId: actor.userId, fromStatus: report.status, toStatus: status, reason: cancellationReason, createdAt: activityTimestamp(report.id) }).returning({ id: bugReportStatusChanges.id });
    await audit(tx, 'bug.status_changed', report.id, actor, args.now, args.correlationId, { statusChangeId: change.id, from: report.status, to: status });
    if (actor.userId !== report.reporterUserId) await enqueueBugNotification(tx, { kind: 'bug_status_changed', reportId: report.id, eventId: change.id, actorUserId: actor.userId, correlationId: args.correlationId });
  }
  if (priority !== report.priority) await audit(tx, 'bug.priority_changed', report.id, actor, args.now, args.correlationId, { priority });
  if (assignedToUserId !== report.assignedToUserId) await audit(tx, 'bug.assignee_changed', report.id, actor, args.now, args.correlationId, { assignedToUserId });
  return { id: report.id, version, status };
}
export async function markBugRead(tx: Tx, args: { actor: Actor; bugId: string; seenActivitySeq: number; now: Date }) {
  const input = parsed(markBugReadInputSchema, { bugId: args.bugId, seenActivitySeq: args.seenActivitySeq });
  const actor = await requireBugActor(tx, args.actor);
  const report = await requireVisibleBug(tx, { actor, bugId: args.bugId, forUpdate: true });
  if (report.reporterUserId !== actor.userId) throw new DomainRuleError('bug_not_visible');
  const readSeq = Math.max(report.reporterReadSeq, Math.min(input.seenActivitySeq, report.reporterActivitySeq));
  if (readSeq > report.reporterReadSeq) await tx.update(bugReports).set({ reporterReadSeq: readSeq, reporterLastReadAt: args.now }).where(eq(bugReports.id, report.id));
  return { readSeq, activitySeq: report.reporterActivitySeq };
}
export async function removeBugImage(tx: Tx, args: Mutation & { imageId: string; reason: string }): Promise<BugImageMeta> {
  const actor = await requireBugActor(tx, args.actor);
  assertCan(actor, 'bugs.triage');
  const reason = parsed(bugReasonSchema, args.reason);
  const [parent] = await tx.select({ bugReportId: bugReportImages.bugReportId }).from(bugReportImages).where(eq(bugReportImages.id, args.imageId)).limit(1);
  if (!parent) throw new DomainRuleError('bug_not_visible');
  await requireVisibleBug(tx, { actor, bugId: parent.bugReportId, forUpdate: true });
  assertCan(await requireBugActor(tx, actor), 'bugs.triage');
  // Metadata only: neither the removal action nor its result loads the original image bytes.
  const [image] = await tx.select({ id: bugReportImages.id, kind: bugReportImages.kind, mimeType: bugReportImages.mimeType, width: bugReportImages.width, height: bugReportImages.height, byteCount: bugReportImages.byteCount, removedAt: bugReportImages.removedAt }).from(bugReportImages).where(eq(bugReportImages.id, args.imageId)).for('update');
  if (!image) throw new DomainRuleError('bug_not_visible');
  if (!image.removedAt) {
    await tx.update(bugReportImages).set({ content: null, removedByUserId: actor.userId, removedAt: args.now, removedReason: reason }).where(eq(bugReportImages.id, image.id));
    await audit(tx, 'bug.image_removed', parent.bugReportId, actor, args.now, args.correlationId, { imageId: image.id });
  }
  return { id: image.id, kind: image.kind, mimeType: image.mimeType, width: image.width, height: image.height, byteCount: image.byteCount, removed: true, url: null };
}
