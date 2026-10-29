import { File } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { PgSelectBuilder } from 'drizzle-orm/pg-core';
import { beforeEach, expect, it, vi } from 'vitest';
import { db } from '@/src/server/db/client';
import { bugReportComments, bugReportFiles, bugReportImages, bugReports } from '@/src/server/db/schema/bugs';
import { users } from '@/src/server/db/schema/users';
import { buildTestActor } from '@/tests/fixtures/actor';
import { createUser } from '@/tests/fixtures/factories';
import { setRolePermissions } from '@/tests/fixtures/role-permissions';
import { truncateAll } from '@/tests/setup/truncate';
import { attachBugPdf, readBugPdf, removeBugPdf } from './files';
import { addBugComment, markBugRead } from './commands';
import { validateBugPdf } from './pdf-validation';
import { getBugDetail, listBugs } from './queries';

beforeEach(truncateAll);
const content = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
async function fixture() {
  const reporter = await buildTestActor((await createUser({ roles: ['bd'] })).id);
  const triager = await buildTestActor((await createUser({ roles: ['md'] })).id);
  const stranger = await buildTestActor((await createUser({ roles: ['bd'] })).id);
  const [report] = await db.insert(bugReports).values({ reporterUserId: reporter.userId, requestId: randomUUID(), summary: 'Synthetic PDF', pagePath: '/today', viewportWidth: 800, viewportHeight: 600, userAgent: 'Synthetic' }).returning();
  const pdf = await validateBugPdf(new File([content], 'synthetic.pdf'));
  const upload = (actor = reporter, options: { commentId?: string; requestId?: string } = {}) => db.transaction(tx => attachBugPdf(tx, { actor, bugId: report.id, requestId: options.requestId ?? randomUUID(), commentId: options.commentId, pdf, now: new Date(), correlationId: 'test' }));
  return { reporter, triager, stranger, report, pdf, upload };
}
it('attaches one report PDF idempotently, projects metadata only and refuses another writer/slot', async () => {
  const f = await fixture(); const requestId = randomUUID(); const attached = await f.upload(f.reporter, { requestId });
  expect(await f.upload(f.reporter, { requestId })).toEqual(attached);
  expect(attached).toMatchObject({ kind: 'report_pdf', mimeType: 'application/pdf', fileName: 'synthetic.pdf', url: `/api/bugs/files/${attached.id}` });
  expect(JSON.stringify(attached)).not.toMatch(/content|base64/);
  await expect(f.upload(f.triager)).rejects.toMatchObject({ code: 'bug_not_visible' });
  await expect(f.upload()).rejects.toMatchObject({ code: 'bug_pdf_already_attached' });
  expect((await listBugs(db, { actor: f.reporter, scope: 'mine' })).items[0].hasPdf).toBe(true);
  expect((await getBugDetail(db, { actor: f.reporter, scope: 'mine', bugId: f.report.id })).pdf).toEqual(attached);
  const [another] = await db.insert(bugReports).values({ reporterUserId: f.reporter.userId, requestId: randomUUID(), summary: 'Synthetic other report', pagePath: '/', viewportWidth: 1, viewportHeight: 1, userAgent: '' }).returning();
  await expect(db.transaction(tx => attachBugPdf(tx, { actor: f.reporter, bugId: another.id, requestId, pdf: f.pdf, now: new Date(), correlationId: 'test' }))).rejects.toMatchObject({ code: 'bug_request_reused' });
});
it.each(['new', 'in_progress'] as const)('allows an empty report PDF slot while the report is %s', async status => {
  const f = await fixture();
  await db.update(bugReports).set({ status }).where(eq(bugReports.id, f.report.id));
  expect(await f.upload()).toMatchObject({ kind: 'report_pdf', removed: false });
});
it.each(['done', 'cancelled'] as const)('refuses a new report PDF after %s while preserving successful upload replays', async status => {
  const empty = await fixture();
  await db.update(bugReports).set({ status }).where(eq(bugReports.id, empty.report.id));
  await expect(empty.upload()).rejects.toMatchObject({ code: 'bug_pdf_not_pending' });
  expect(await db.select().from(bugReportFiles)).toHaveLength(0);

  const attached = await fixture();
  const requestId = randomUUID();
  const original = await attached.upload(attached.reporter, { requestId });
  await db.update(bugReports).set({ status }).where(eq(bugReports.id, attached.report.id));
  expect(await attached.upload(attached.reporter, { requestId })).toEqual(original);
});
it('refuses a comment ID from another report even when the caller authored both', async () => {
  const f = await fixture();
  const [other] = await db.insert(bugReports).values({ reporterUserId: f.reporter.userId, requestId: randomUUID(), summary: 'Synthetic other report', pagePath: '/', viewportWidth: 1, viewportHeight: 1, userAgent: '' }).returning();
  const comment = await db.transaction(tx => addBugComment(tx, { actor: f.reporter, bugId: other.id, input: { requestId: randomUUID(), pendingPdf: true }, now: new Date(), correlationId: 'test' }));
  await expect(f.upload(f.reporter, { commentId: comment.comment.id })).rejects.toMatchObject({ code: 'bug_not_visible' });
  expect(await db.select().from(bugReportFiles)).toHaveLength(0);
  expect((await db.select().from(bugReportComments).where(eq(bugReportComments.id, comment.comment.id)))[0].pendingPdf).toBe(true);
});
it('authorizes reporter/triager before selecting bytes and refuses stale/inactive/removed access', async () => {
  const f = await fixture(); const attached = await f.upload();
  for (const actor of [f.reporter, f.triager]) expect(await readBugPdf(db, { actor, fileId: attached.id })).toMatchObject({ content, fileName: 'synthetic.pdf' });
  const from = vi.spyOn(PgSelectBuilder.prototype, 'from');
  try {
    await expect(readBugPdf(db, { actor: f.stranger, fileId: attached.id })).rejects.toMatchObject({ code: 'bug_not_visible' });
    // Inspect the real attachment query: select() expands to all table columns.
    const attachmentQueries = from.mock.calls.flatMap(([table], index) => {
      const result = from.mock.results[index];
      return table === bugReportFiles && result.type === 'return' ? [result.value.toSQL().sql] : [];
    });
    expect(attachmentQueries).toHaveLength(1);
    expect(attachmentQueries[0]).not.toMatch(/"content"/);
  } finally { from.mockRestore(); }
  await db.update(users).set({ status: 'inactive' }).where(eq(users.id, f.reporter.userId));
  await expect(readBugPdf(db, { actor: f.reporter, fileId: attached.id })).rejects.toMatchObject({ code: 'bug_not_visible' });
  await expect(db.transaction(tx => removeBugPdf(tx, { actor: f.stranger, fileId: attached.id, reason: 'test', now: new Date(), correlationId: 'test' }))).rejects.toThrow();
  const removed = await db.transaction(tx => removeBugPdf(tx, { actor: f.triager, fileId: attached.id, reason: 'Synthetic removal', now: new Date(), correlationId: 'test' }));
  expect(removed).toMatchObject({ removed: true, url: null });
  await expect(readBugPdf(db, { actor: f.triager, fileId: attached.id })).rejects.toMatchObject({ code: 'bug_not_visible' });
  expect((await getBugDetail(db, { actor: f.triager, scope: 'triage', bugId: f.report.id })).pdf).toEqual(removed);
  await expect(db.execute(sql`delete from bug_report_files`)).rejects.toThrow();
  await expect(db.execute(sql`truncate bug_report_files`)).rejects.toThrow();
  await expect(db.update(bugReportFiles).set({ content }).where(eq(bugReportFiles.id, attached.id))).rejects.toThrow();
  const [stored] = await db.select().from(bugReportFiles).where(eq(bugReportFiles.id, attached.id));
  expect(stored).toMatchObject({ content: null, removedByUserId: f.triager.userId, removedReason: 'Synthetic removal' });
  await expect(db.update(bugReportFiles).set({ removedAt: new Date(stored.removedAt!.getTime() + 1) }).where(eq(bugReportFiles.id, attached.id))).rejects.toThrow();
  await expect(db.update(bugReportFiles).set({ uploadedByUserId: f.triager.userId }).where(eq(bugReportFiles.id, attached.id))).rejects.toThrow();
  await expect(db.update(bugReportFiles).set({ requestId: randomUUID() }).where(eq(bugReportFiles.id, attached.id))).rejects.toThrow();
  await db.update(bugReportFiles).set({ fileName: '[redacted].pdf', removedReason: '[redacted]' }).where(eq(bugReportFiles.id, attached.id));
  expect((await db.select().from(bugReportFiles).where(eq(bugReportFiles.id, attached.id)))[0]).toMatchObject({ content: null, fileName: '[redacted].pdf', removedReason: '[redacted]', removedByUserId: stored.removedByUserId, removedAt: stored.removedAt });
});

it('reloads effective grants for stale actors, including revoked triagers and deactivated authors', async () => {
  const f = await fixture(); const attached = await f.upload();
  await setRolePermissions({ md: { 'bugs.triage': false }, bd: { 'bugs.report': false } });
  await expect(readBugPdf(db, { actor: f.triager, fileId: attached.id })).rejects.toMatchObject({ code: 'bug_not_visible' });
  await expect(readBugPdf(db, { actor: f.reporter, fileId: attached.id })).rejects.toMatchObject({ code: 'bug_not_visible' });
  await expect(f.upload()).rejects.toMatchObject({ code: 'bug_not_visible' });
  await expect(db.transaction(tx => removeBugPdf(tx, { actor: f.triager, fileId: attached.id, reason: 'Synthetic', now: new Date(), correlationId: 'test' }))).rejects.toThrow();
});

it('bounds database file metadata and prevents binary content/identity replacement before removal', async () => {
  const f = await fixture(); const attached = await f.upload();
  for (const patch of [{ content: Buffer.from('%PDF-other') }, { kind: 'comment_pdf' as const }, { byteCount: content.length + 1 }, { fileName: '' }, { fileName: 'x'.repeat(201) }]) {
    await expect(db.update(bugReportFiles).set(patch).where(eq(bugReportFiles.id, attached.id))).rejects.toThrow();
  }
  expect((await readBugPdf(db, { actor: f.reporter, fileId: attached.id })).content).toEqual(content);
  const base = { bugReportId: f.report.id, requestId: randomUUID(), kind: 'report_pdf' as const, content: null, mimeType: 'application/pdf' as const, fileName: 'synthetic.pdf', byteCount: 4194305, uploadedByUserId: f.reporter.userId, removedByUserId: f.reporter.userId, removedAt: new Date(), removedReason: 'Synthetic' };
  // Separate report avoids a uniqueness error concealing the byte-count check.
  const [other] = await db.insert(bugReports).values({ reporterUserId: f.reporter.userId, requestId: randomUUID(), summary: 'Synthetic bounds', pagePath: '/', viewportWidth: 1, viewportHeight: 1, userAgent: '' }).returning();
  await expect(db.insert(bugReportFiles).values({ ...base, bugReportId: other.id })).rejects.toThrow();
});
it('reserves a NULL-body pending PDF comment, binds the original author, and marks late arrival unread exactly once', async () => {
  const f = await fixture(); const requestId = randomUUID();
  const comment = await db.transaction(tx => addBugComment(tx, { actor: f.triager, bugId: f.report.id, input: { requestId, pendingPdf: true }, now: new Date(), correlationId: 'test' }));
  expect(comment).toMatchObject({ comment: { body: null, pendingPdf: true }, activitySeq: 1 });
  await db.transaction(tx => markBugRead(tx, { actor: f.reporter, bugId: f.report.id, seenActivitySeq: 1, now: new Date() }));
  await expect(f.upload(f.reporter, { commentId: comment.comment.id })).rejects.toMatchObject({ code: 'bug_not_visible' });
  const uploadRequestId = randomUUID(); await f.upload(f.triager, { commentId: comment.comment.id, requestId: uploadRequestId });
  await f.upload(f.triager, { commentId: comment.comment.id, requestId: uploadRequestId });
  const [report] = await db.select().from(bugReports).where(eq(bugReports.id, f.report.id));
  expect(report.reporterActivitySeq).toBe(2); expect(report.reporterReadSeq).toBe(1);
  const detail = await getBugDetail(db, { actor: f.reporter, scope: 'mine', bugId: f.report.id });
  expect(detail.comments[0]).toMatchObject({ pendingPdf: false, body: null, pdf: { kind: 'comment_pdf' } });
  expect(detail.comments[0]).not.toHaveProperty('authorUserId');
  expect(await db.select().from(bugReportComments)).toHaveLength(1);
});
it('uses image and PDF tombstone bytes in the same 50 MiB quota and rolls failed upload back', async () => {
  const f = await fixture();
  for (let index = 0; index < 25; index++) {
    const [parent] = await db.insert(bugReports).values({ reporterUserId: f.reporter.userId, requestId: randomUUID(), summary: 'Synthetic quota', pagePath: '/', viewportWidth: 1, viewportHeight: 1, userAgent: '' }).returning();
    await db.insert(bugReportImages).values({ bugReportId: parent.id, kind: 'screenshot', content: null, mimeType: 'image/png', width: 1, height: 1, byteCount: 2097152, uploadedByUserId: f.reporter.userId, removedByUserId: f.reporter.userId, removedAt: new Date(), removedReason: 'Synthetic' });
  }
  await expect(f.upload()).rejects.toMatchObject({ code: 'bug_image_quota_exceeded' });
  expect(await db.select().from(bugReportFiles)).toHaveLength(0);
  expect((await db.select().from(bugReports).where(eq(bugReports.id, f.report.id)))[0].reporterActivitySeq).toBe(0);
});
