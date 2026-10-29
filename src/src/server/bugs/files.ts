import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { attachBugPdfInputSchema, bugReasonSchema } from '@/src/lib/bugs/input';
import { inspectBugPdf, sanitizeBugPdfFileName } from '@/src/lib/bugs/pdf';
import type { BugPdfMeta } from '@/src/lib/bugs/types';
import type { Actor } from '@/src/server/auth/actor';
import { assertCan } from '@/src/server/auth/permissions';
import type { DbOrTx, Tx } from '@/src/server/db/client';
import { bugReportComments, bugReportFiles, bugReports } from '@/src/server/db/schema/bugs';
import { DomainRuleError, ValidationError } from '@/src/server/errors';
import { actorRef, appendEvent } from '@/src/server/events/append';
import { requireBugActor, requireVisibleBug } from './access';
import type { ValidatedBugPdf } from './pdf-validation';
import { checkBugImageQuota, lockBugQuota } from './rate-limit';

/** Explicit selection ensures mutations and projections never load binary bytes. */
export const bugPdfFields = {
  id: bugReportFiles.id, kind: bugReportFiles.kind, mimeType: bugReportFiles.mimeType,
  fileName: bugReportFiles.fileName, byteCount: bugReportFiles.byteCount, removedAt: bugReportFiles.removedAt,
};
export function toBugPdfMeta(row: Omit<BugPdfMeta, 'removed' | 'url'> & { removedAt: Date | null }): BugPdfMeta {
  return { id: row.id, kind: row.kind, mimeType: row.mimeType, fileName: row.fileName, byteCount: row.byteCount,
    removed: row.removedAt !== null, url: row.removedAt === null ? `/api/bugs/files/${row.id}` : null };
}
const invisible = (): never => { throw new DomainRuleError('bug_not_visible'); };
type Mutation = { actor: Actor; now: Date; correlationId: string };

export async function attachBugPdf(tx: Tx, args: Mutation & { bugId: string; commentId?: string; requestId: string; pdf: ValidatedBugPdf }): Promise<BugPdfMeta> {
  const input = attachBugPdfInputSchema.safeParse({ bugId: args.bugId, commentId: args.commentId, requestId: args.requestId });
  if (!input.success) throw new ValidationError([{ path: 'pdf', code: 'invalid_bug_input' }]);
  const actor = await requireBugActor(tx, args.actor);
  await lockBugQuota(tx, actor.userId, 'pdf');
  const report = await requireVisibleBug(tx, { actor, bugId: input.data.bugId, forUpdate: true });
  const currentActor = await requireBugActor(tx, actor);
  const [comment] = input.data.commentId ? await tx.select({ id: bugReportComments.id, authorUserId: bugReportComments.authorUserId,
    pendingPdf: bugReportComments.pendingPdf }).from(bugReportComments).where(and(eq(bugReportComments.id, input.data.commentId), eq(bugReportComments.bugReportId, report.id))).limit(1) : [];
  if (input.data.commentId ? !comment || comment.authorUserId !== actor.userId : report.reporterUserId !== actor.userId) return invisible();
  if (!input.data.commentId) assertCan(currentActor, 'bugs.report');
  const [replay] = await tx.select({ ...bugPdfFields, bugReportId: bugReportFiles.bugReportId, commentId: bugReportFiles.commentId })
    .from(bugReportFiles).where(and(eq(bugReportFiles.uploadedByUserId, actor.userId), eq(bugReportFiles.requestId, input.data.requestId))).limit(1);
  if (replay) {
    if (replay.bugReportId !== report.id || replay.commentId !== (input.data.commentId ?? null)) throw new DomainRuleError('bug_request_reused');
    return toBugPdfMeta(replay);
  }
  if (!input.data.commentId && report.status !== 'new' && report.status !== 'in_progress') throw new DomainRuleError('bug_pdf_not_pending');
  if (comment && !comment.pendingPdf) throw new DomainRuleError('bug_pdf_not_pending');
  const [existing] = await tx.select({ id: bugReportFiles.id }).from(bugReportFiles).where(and(eq(bugReportFiles.bugReportId, report.id),
    input.data.commentId ? eq(bugReportFiles.commentId, input.data.commentId) : isNull(bugReportFiles.commentId))).limit(1);
  if (existing) throw new DomainRuleError('bug_pdf_already_attached');
  await checkBugImageQuota(tx, actor.userId, args.pdf.byteCount);
  const [file] = await tx.insert(bugReportFiles).values({ bugReportId: report.id, commentId: input.data.commentId ?? null,
    requestId: input.data.requestId, kind: input.data.commentId ? 'comment_pdf' : 'report_pdf', ...args.pdf,
    uploadedByUserId: actor.userId, createdAt: sql`clock_timestamp()` }).returning(bugPdfFields);
  if (comment) await tx.update(bugReportComments).set({ pendingPdf: false }).where(eq(bugReportComments.id, comment.id));
  // A reporter may have read the pending comment before this separate request.
  // The first successful late arrival is new activity; replays return above.
  await tx.update(bugReports).set({ updatedAt: sql`clock_timestamp()`,
    reporterActivitySeq: report.reporterActivitySeq + (actor.userId !== report.reporterUserId && currentActor.permissions.has('bugs.triage') ? 1 : 0),
  }).where(eq(bugReports.id, report.id));
  await appendEvent(tx, { type: 'bug.pdf_attached', subjectType: 'bug_report', subjectId: report.id,
    actor: actorRef(actor), occurredAt: args.now, correlationId: args.correlationId, payload: { fileId: file.id, ...(comment ? { commentId: comment.id } : {}) } });
  return toBugPdfMeta(file);
}

/** Visibility is established before any bytes are selected. */
export async function readBugPdf(database: DbOrTx, input: { actor: Actor; fileId: string }): Promise<ValidatedBugPdf> {
  const [metadata] = await database.select({ bugReportId: bugReportFiles.bugReportId, removedAt: bugReportFiles.removedAt })
    .from(bugReportFiles).where(eq(bugReportFiles.id, input.fileId)).limit(1);
  if (!metadata) return invisible();
  await requireVisibleBug(database, { actor: input.actor, bugId: metadata.bugReportId });
  if (metadata.removedAt) return invisible();
  const [row] = await database.select({ content: bugReportFiles.content, mimeType: bugReportFiles.mimeType,
    byteCount: bugReportFiles.byteCount, fileName: bugReportFiles.fileName }).from(bugReportFiles).where(eq(bugReportFiles.id, input.fileId)).limit(1);
  if (!row?.content) return invisible();
  try {
    const inspected = inspectBugPdf(row.content);
    if (row.mimeType !== inspected.mimeType || row.byteCount !== inspected.byteCount) return invisible();
  } catch { return invisible(); }
  return { ...row, content: row.content, fileName: sanitizeBugPdfFileName(row.fileName) };
}

export async function removeBugPdf(tx: Tx, args: Mutation & { fileId: string; reason: string }): Promise<BugPdfMeta> {
  const actor = await requireBugActor(tx, args.actor);
  assertCan(actor, 'bugs.triage');
  const reason = bugReasonSchema.safeParse(args.reason);
  if (!reason.success) throw new ValidationError([{ path: 'reason', code: 'invalid_bug_input' }]);
  const [parent] = await tx.select({ bugReportId: bugReportFiles.bugReportId }).from(bugReportFiles).where(eq(bugReportFiles.id, args.fileId)).limit(1);
  if (!parent) return invisible();
  await requireVisibleBug(tx, { actor, bugId: parent.bugReportId, forUpdate: true });
  assertCan(await requireBugActor(tx, actor), 'bugs.triage');
  const [file] = await tx.select(bugPdfFields).from(bugReportFiles).where(eq(bugReportFiles.id, args.fileId)).for('update');
  if (!file) return invisible();
  if (!file.removedAt) {
    await tx.update(bugReportFiles).set({ content: null, removedByUserId: actor.userId, removedAt: args.now, removedReason: reason.data }).where(eq(bugReportFiles.id, file.id));
    await appendEvent(tx, { type: 'bug.pdf_removed', subjectType: 'bug_report', subjectId: parent.bugReportId,
      actor: actorRef(actor), occurredAt: args.now, correlationId: args.correlationId, payload: { fileId: file.id } });
  }
  return toBugPdfMeta({ ...file, removedAt: file.removedAt ?? args.now });
}
