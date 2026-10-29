import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/server/db/client';
import { bugReports, bugReportComments, bugReportStatusChanges, bugReportImages } from '@/src/server/db/schema/bugs';
import { events } from '@/src/server/db/schema/events';
import { users } from '@/src/server/db/schema/users';
import { buildTestActor } from '@/tests/fixtures/actor';
import { createUser } from '@/tests/fixtures/factories';
import { setRolePermissions } from '@/tests/fixtures/role-permissions';
import { truncateAll } from '@/tests/setup/truncate';
import { createBug, addBugComment, updateBug, markBugRead, removeBugImage } from './commands';
beforeEach(truncateAll);
const now = new Date('2026-10-27T02:00:00Z');
const correlationId = 'bugs-test';
async function setup() {
  const reporter = await buildTestActor((await createUser({ roles: ['intake_admin'] })).id);
  const triager = await buildTestActor((await createUser({ roles: ['md'] })).id);
  const stranger = await buildTestActor((await createUser({ roles: ['bd'] })).id);
  return { reporter, triager, stranger };
}
const context = { pagePath: '/today', pageQuery: '', viewportWidth: 800, viewportHeight: 600, userAgent: 'synthetic', osName: null, osVersion: null, browserName: null, browserVersion: null, deviceType: null, appBuildSha: null };
async function report(actor: Awaited<ReturnType<typeof buildTestActor>>, requestId = randomUUID()) {
  return db.transaction(tx => createBug(tx, { actor, input: { requestId, summary: '  Synthetic bug  ', description: null }, context, now, correlationId }));
}
it('rejects empty and whitespace summary directly in the service without partial rows', async () => {
  const { reporter } = await setup();
  for (const summary of ['', '   \n ']) await expect(db.transaction(tx => createBug(tx, { actor: reporter, input: { requestId: randomUUID(), summary }, context, now, correlationId }))).rejects.toThrow();
  expect(await db.select().from(bugReports)).toHaveLength(0);
  expect(await db.select().from(bugReportStatusChanges)).toHaveLength(0);
});
it('records the acting triager, transition and trimmed cancellation reason together', async () => {
  const { reporter, triager } = await setup(); const saved = await report(reporter);
  await db.transaction(tx => updateBug(tx, { actor: triager, bugId: saved.id, expectedVersion: 1, patch: { status: 'cancelled' }, reason: '  Duplicate report  ', now, correlationId }));
  expect(await db.select().from(bugReportStatusChanges)).toEqual(expect.arrayContaining([expect.objectContaining({ bugReportId: saved.id, changedByUserId: triager.userId, fromStatus: 'new', toStatus: 'cancelled', reason: 'Duplicate report' })]));
});
it('creates summary-only reports with initial history and safe, idempotent results', async () => {
  const { reporter } = await setup();
  const requestId = randomUUID();
  const saved = await report(reporter, requestId);
  expect(await report(reporter, requestId)).toEqual(saved);
  expect(await db.select().from(bugReports)).toHaveLength(1);
  const [row] = await db.select().from(bugReports);
  expect(row).toMatchObject({ summary: 'Synthetic bug', status: 'new', priority: null, reporterActivitySeq: 0, reporterReadSeq: 0, version: 1 });
  expect(await db.select().from(bugReportStatusChanges)).toMatchObject([{ fromStatus: null, toStatus: 'new', changedByUserId: reporter.userId }]);
  const audit = await db.select().from(events);
  expect(audit).toHaveLength(1);
  expect(JSON.stringify(audit)).not.toContain('Synthetic bug');
});
it('requires fresh active permissions and refuses stranger comments and triage', async () => {
  const { reporter, triager, stranger } = await setup(); const saved = await report(reporter);
  await expect(db.transaction(tx => addBugComment(tx, { actor: stranger, bugId: saved.id, input: { requestId: randomUUID(), body: 'no' }, now, correlationId }))).rejects.toMatchObject({ code: 'bug_not_visible' });
  await expect(db.transaction(tx => updateBug(tx, { actor: reporter, bugId: saved.id, expectedVersion: 1, patch: { priority: 'high' }, now, correlationId }))).rejects.toMatchObject({ reasonCode: 'role_missing_permission' });
  await db.update(users).set({ status: 'inactive' }).where(eq(users.id, triager.userId));
  await expect(db.transaction(tx => updateBug(tx, { actor: triager, bugId: saved.id, expectedVersion: 1, patch: { status: 'in_progress' }, now, correlationId }))).rejects.toMatchObject({ code: 'bug_not_visible' });
});
it('pins workflow, reason, optimistic conflicts, no-op and metadata-only history', async () => {
  const { reporter, triager } = await setup(); const saved = await report(reporter);
  const change = (expectedVersion: number, patch: Parameters<typeof updateBug>[1]['patch'], reason?: string) => db.transaction(tx => updateBug(tx, { actor: triager, bugId: saved.id, expectedVersion, patch, reason, now, correlationId }));
  await expect(change(1, { status: 'done' })).rejects.toThrow();
  await expect(change(1, { status: 'cancelled' })).rejects.toThrow();
  expect(await change(1, { status: 'new' })).toMatchObject({ version: 1 });
  expect(await change(1, { priority: 'high' })).toMatchObject({ version: 2 });
  expect(await db.select().from(bugReportStatusChanges)).toHaveLength(1);
  await expect(change(1, { status: 'in_progress' })).rejects.toMatchObject({ currentVersion: 2 });
  expect(await change(2, { status: 'cancelled' }, 'duplicate')).toMatchObject({ version: 3, status: 'cancelled' });
  expect(await change(3, { status: 'in_progress' })).toMatchObject({ version: 4 });
  expect(await change(4, { status: 'done' })).toMatchObject({ version: 5 });
  expect((await db.select().from(bugReportStatusChanges)).map(r => [r.fromStatus, r.toStatus])).toEqual([[null,'new'],['new','cancelled'],['cancelled','in_progress'],['in_progress','done']]);
});
it('allows only active effective triage assignees and increments no activity for assignment', async () => {
  const { reporter, triager, stranger } = await setup(); const saved = await report(reporter);
  const assign = (id: string) => db.transaction(tx => updateBug(tx, { actor: triager, bugId: saved.id, expectedVersion: 1, patch: { assignedToUserId: id }, now, correlationId }));
  await expect(assign(stranger.userId)).rejects.toMatchObject({ code: 'bug_assignee_unavailable' });
  expect(await assign(triager.userId)).toMatchObject({ version: 2 });
  expect((await db.select().from(bugReports))[0]).toMatchObject({ assignedToUserId: triager.userId, reporterActivitySeq: 0, reporterReadSeq: 0 });
  expect(await db.select().from(bugReportStatusChanges)).toHaveLength(1);
});
it('rejects an inactive otherwise-capable assignee at write time', async () => {
  const { reporter, triager } = await setup(); const saved = await report(reporter);
  const assignee = await buildTestActor((await createUser({ roles: ['md'] })).id);
  expect(assignee.permissions.has('bugs.triage')).toBe(true);
  await db.update(users).set({ status: 'inactive' }).where(eq(users.id, assignee.userId));
  await expect(db.transaction(tx => updateBug(tx, { actor: triager, bugId: saved.id, expectedVersion: 1, patch: { assignedToUserId: assignee.userId }, now, correlationId }))).rejects.toMatchObject({ code: 'bug_assignee_unavailable' });
  expect((await db.select().from(bugReports))[0]).toMatchObject({ assignedToUserId: null, version: 1, reporterActivitySeq: 0, reporterReadSeq: 0 });
});
it('rejects an explicitly revoked triager assignee at write time', async () => {
  const { reporter, triager: assignee } = await setup(); const saved = await report(reporter);
  const triager = await buildTestActor((await createUser({ roles: ['system_admin'] })).id);
  expect(assignee.permissions.has('bugs.triage')).toBe(true);
  await setRolePermissions({ md: { 'bugs.triage': false } });
  await expect(db.transaction(tx => updateBug(tx, { actor: triager, bugId: saved.id, expectedVersion: 1, patch: { assignedToUserId: assignee.userId }, now, correlationId }))).rejects.toMatchObject({ code: 'bug_assignee_unavailable' });
  expect((await db.select().from(bugReports))[0]).toMatchObject({ assignedToUserId: null, version: 1, reporterActivitySeq: 0, reporterReadSeq: 0 });
});
it('accepts a non-MD assignee with newly delegated effective triage permission without reporter activity', async () => {
  const { reporter, triager, stranger: assignee } = await setup(); const saved = await report(reporter);
  expect(assignee.roles.has('md')).toBe(false);
  expect(assignee.permissions.has('bugs.triage')).toBe(false);
  await setRolePermissions({ bd: { 'bugs.triage': true } });
  expect(await db.transaction(tx => updateBug(tx, { actor: triager, bugId: saved.id, expectedVersion: 1, patch: { assignedToUserId: assignee.userId }, now, correlationId }))).toMatchObject({ version: 2 });
  expect((await db.select().from(bugReports))[0]).toMatchObject({ assignedToUserId: assignee.userId, version: 2, reporterActivitySeq: 0, reporterReadSeq: 0 });
  expect(await db.select().from(bugReportStatusChanges)).toHaveLength(1);
});
it('keeps racing replies unread and read markers preserve business version and time', async () => {
  const { reporter, triager } = await setup(); const saved = await report(reporter);
  const reply = (actor = triager, requestId = randomUUID()) => db.transaction(tx => addBugComment(tx, { actor, bugId: saved.id, input: { requestId, body: 'reply' }, now, correlationId }));
  const requestId = randomUUID(); await reply(triager, requestId); await reply(triager, requestId);
  await reply(reporter); await reply();
  const [before] = await db.select().from(bugReports);
  expect(before.reporterActivitySeq).toBe(2);
  await expect(db.transaction(tx => markBugRead(tx, { actor: triager, bugId: saved.id, seenActivitySeq: 2, now }))).rejects.toThrow();
  await db.transaction(tx => markBugRead(tx, { actor: reporter, bugId: saved.id, seenActivitySeq: 1, now }));
  const [after] = await db.select().from(bugReports);
  expect(after).toMatchObject({ reporterReadSeq: 1, reporterActivitySeq: 2, version: before.version, updatedAt: before.updatedAt });
  await db.transaction(tx => markBugRead(tx, { actor: reporter, bugId: saved.id, seenActivitySeq: 0, now }));
  expect((await db.select().from(bugReports))[0].reporterReadSeq).toBe(1);
  expect(await db.select().from(bugReportComments)).toHaveLength(3);
});
it('serializes competing versions with exactly one winner and correct history', async () => {
  const { reporter, triager } = await setup(); const saved = await report(reporter);
  const results = await Promise.allSettled(['in_progress','cancelled'].map(status => db.transaction(tx => updateBug(tx, { actor: triager, bugId: saved.id, expectedVersion: 1, patch: { status: status as 'in_progress'|'cancelled' }, reason: 'duplicate', now, correlationId }))));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(await db.select().from(bugReportStatusChanges)).toHaveLength(2);
});
it('keeps one-way image evidence and rolls all writes back with the transaction', async () => {
  const { reporter, triager } = await setup(); const saved = await report(reporter);
  const [image] = await db.insert(bugReportImages).values({ bugReportId: saved.id, kind: 'screenshot', content: Buffer.from([1,2,3]), mimeType: 'image/png', width: 1, height: 1, byteCount: 3, uploadedByUserId: reporter.userId }).returning();
  await expect(db.transaction(tx => removeBugImage(tx, { actor: reporter, imageId: image.id, reason: 'private', now, correlationId }))).rejects.toThrow();
  const tombstone = await db.transaction(tx => removeBugImage(tx, { actor: triager, imageId: image.id, reason: 'private', now, correlationId }));
  expect(await db.transaction(tx => removeBugImage(tx, { actor: triager, imageId: image.id, reason: 'different', now, correlationId }))).toEqual(tombstone);
  expect((await db.select().from(bugReportImages))[0]).toMatchObject({ content: null, removedByUserId: triager.userId, removedReason: 'private' });
  const before = await db.select().from(events);
  await expect(db.transaction(async tx => { await addBugComment(tx, { actor: triager, bugId: saved.id, input: { requestId: randomUUID(), body: 'rollback' }, now, correlationId }); throw new Error('rollback'); })).rejects.toThrow('rollback');
  expect(await db.select().from(bugReportComments)).toHaveLength(0);
  expect(await db.select().from(events)).toEqual(before);
  await expect(db.execute(sql`update bug_report_images set content = decode('aa','hex'), removed_at=null, removed_by_user_id=null, removed_reason=null where id=${image.id}`)).rejects.toThrow();
});

it('replays the original comment watermark after newer unseen activity', async () => {
  const { reporter, triager } = await setup(); const saved = await report(reporter);
  const requestId = randomUUID();
  const first = await db.transaction(tx => addBugComment(tx, { actor: triager, bugId: saved.id, input: { requestId, body: 'first' }, now, correlationId }));
  await db.transaction(tx => addBugComment(tx, { actor: triager, bugId: saved.id, input: { requestId: randomUUID(), body: 'later' }, now, correlationId }));
  expect(await db.transaction(tx => addBugComment(tx, { actor: triager, bugId: saved.id, input: { requestId, body: 'first' }, now, correlationId }))).toEqual(first);
});

it('orders a delayed status save after more than fifty newer changes for its unread watermark', async () => {
  const { reporter, triager } = await setup(); const saved = await report(reporter);
  const old = new Date('2000-01-01T00:00:00Z');
  let version = 1;
  for (let index = 0; index < 52; index++) {
    const status = index % 2 === 0 ? 'in_progress' : 'done';
    const changed = await db.transaction(tx => updateBug(tx, { actor: triager, bugId: saved.id, expectedVersion: version, patch: { status }, now: index === 51 ? old : now, correlationId }));
    version = changed.version;
  }
  const { getBugDetail } = await import('./queries');
  const detail = await getBugDetail(db, { actor: reporter, bugId: saved.id, scope: 'mine' });
  expect(detail.statusChanges).toHaveLength(50);
  expect(detail.statusChanges.at(-1)?.toStatus).toBe('done');
  const [latest] = await db.select().from(bugReportStatusChanges).where(eq(bugReportStatusChanges.bugReportId, saved.id)).orderBy(sql`created_at desc, id desc`).limit(1);
  expect(detail.statusChanges.at(-1)?.id).toBe(latest.id);
  expect(latest.toStatus).toBe('done');
  expect(latest.createdAt.getTime()).toBeGreaterThan(old.getTime());
  expect(detail.seenActivitySeq).toBe(52);
});

it('stores delayed comment timestamps after the locked report thread and keeps the last reply in its initial window', async () => {
  const { reporter, triager } = await setup(); const saved = await report(reporter);
  // Simulate later committed thread activity while an earlier request waited for its report lock.
  const future = new Date(Date.now() + 60_000);
  await db.insert(bugReportComments).values(Array.from({length:51},(_,index)=>({ bugReportId:saved.id,authorUserId:triager.userId,requestId:randomUUID(),body:`earlier ${index}`,createdAt:new Date(future.getTime()+index) })));
  const last = await db.transaction(tx => addBugComment(tx,{ actor:triager,bugId:saved.id,input:{requestId:randomUUID(),body:'last committed'},now:new Date('2000-01-01'),correlationId }));
  const { getBugDetail } = await import('./queries');
  const detail = await getBugDetail(db,{actor:reporter,bugId:saved.id,scope:'mine'});
  expect(detail.comments).toHaveLength(50);
  expect(detail.comments.at(-1)?.id).toBe(last.comment.id);
});

it('rolls back report/comment/image/history/audit atomically when attachment insertion fails', async () => {
  const { reporter, triager } = await setup();
  const image = { content: Buffer.from([1]), mimeType: 'image/png' as const, width: 1, height: 1, byteCount: 2 };
  await expect(db.transaction(tx => createBug(tx,{ actor:reporter,input:{requestId:randomUUID(),summary:'Rollback'},context,image,now,correlationId }))).rejects.toThrow();
  expect(await db.select().from(bugReports)).toHaveLength(0);
  expect(await db.select().from(bugReportStatusChanges)).toHaveLength(0);
  expect(await db.select().from(events)).toHaveLength(0);
  const saved = await report(reporter);
  await expect(db.transaction(tx => addBugComment(tx,{actor:triager,bugId:saved.id,input:{requestId:randomUUID(),body:null},image,now,correlationId}))).rejects.toThrow();
  expect(await db.select().from(bugReportComments)).toHaveLength(0);
  expect(await db.select().from(bugReportImages)).toHaveLength(0);
  expect((await db.select().from(bugReports))[0]).toMatchObject({reporterActivitySeq:0,version:1});
  expect(await db.select().from(events)).toHaveLength(1);
});

it('counts concurrent retries once and refuses a comment retry key on another report', async () => {
  const { reporter, triager } = await setup(); const requestId = randomUUID();
  const created = await Promise.all(Array.from({length:6},()=>report(reporter,requestId)));
  expect(new Set(created.map(r=>r.id)).size).toBe(1);
  expect(await db.select().from(bugReports)).toHaveLength(1);
  const commentId = randomUUID();
  const replies = await Promise.all(Array.from({length:3},()=>db.transaction(tx=>addBugComment(tx,{actor:triager,bugId:created[0].id,input:{requestId:commentId,body:'once'},now,correlationId}))));
  expect(replies[0]).toEqual(replies[1]);expect(replies[1]).toEqual(replies[2]);
  expect(await db.select().from(bugReportComments)).toHaveLength(1);
  const other = await report(reporter);
  await expect(db.transaction(tx=>addBugComment(tx,{actor:triager,bugId:other.id,input:{requestId:commentId,body:'once'},now,correlationId}))).rejects.toMatchObject({code:'bug_request_reused'});
});
