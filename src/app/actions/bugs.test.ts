import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/src/server/db/client';
import { bugReports, bugReportComments, bugReportFiles, bugReportImages, bugReportStatusChanges } from '@/src/server/db/schema/bugs';
import { events } from '@/src/server/db/schema/events';
import * as eventAppend from '@/src/server/events/append';
import { chatMessages, chatWebhooks } from '@/src/server/db/schema/chat';
import { outboxJobs } from '@/src/server/db/schema/jobs';
import { sealSecret } from '@/src/server/crypto/sealed-secret';
import { serverEnv } from '@/src/server/env';
import { handleChatMessageSend } from '@/src/server/google-chat/deliver-job';
import type { WebhookTransport } from '@/src/server/google-chat/webhook-client';
import type { ClaimedJob } from '@/src/server/jobs/outbox';
import { asActor } from '@/tests/fixtures/as-actor';
import { createUser } from '@/tests/fixtures/factories';
import { truncateAll } from '@/tests/setup/truncate';
import { scheduleImmediateDrain } from '@/src/server/jobs/drain';
import { createBugAction, addBugCommentAction, updateBugAction, markBugReadAction, removeBugImageAction, loadBugThreadAction, attachBugPdfAction, removeBugPdfAction } from './bugs';
vi.mock('next/headers', async () => (await import('@/tests/fixtures/as-actor')).nextHeadersMock);
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/src/server/jobs/drain', () => ({ scheduleImmediateDrain: vi.fn() }));
beforeEach(async () => { await truncateAll(); vi.clearAllMocks(); vi.mocked(scheduleImmediateDrain).mockReset(); });
afterEach(() => vi.unstubAllEnvs());
function form(extra: Record<string, string | File> = {}) {
  const data = new FormData();
  for (const [key,value] of Object.entries({ requestId: randomUUID(), summary: 'Synthetic report', pathname: '/bugs', query: 'status=new&q=private&token=secret', viewportWidth: '800', viewportHeight: '600', ...extra })) data.append(key,value);
  return data;
}
it('all eight actions reject anonymous requests before parsing or reads', async () => {
  for (const action of [createBugAction,addBugCommentAction,updateBugAction,markBugReadAction,removeBugImageAction,loadBugThreadAction,attachBugPdfAction,removeBugPdfAction]) expect(await action({})).toMatchObject({ ok: false, code: 'unauthenticated' });
  expect(await db.select().from(bugReports)).toHaveLength(0);
});

it('uploads a PDF in a separate idempotent action and leaves the saved report after rejection', async () => {
  const reporter = await createUser({ roles: ['bd'] }); const triager = await createUser({ roles: ['md'] });
  const saved = await asActor(reporter, () => createBugAction(form())); if (!saved.ok) throw new Error('setup');
  const data = new FormData(); data.set('bugId', saved.data.id); data.set('requestId', randomUUID());
  // Loop F permits destination OpenActions, while executable actions remain rejected.
  for (const bytes of ['bad', '%PDF-1.7\n/JS', '%PDF-1.7\n/OpenAction << /S /JavaScript /JS (alert) >>', '%PDF-1.7\n/EmbeddedFile', '%PDF-1.7\n/JavaScript', '%PDF-1.7\n/Launch', '%PDF-1.7\n/XFA', '%PDF-1.7\n/RichMedia']) {
    data.set('pdf', new File([bytes], 'synthetic.pdf', { type: 'application/pdf' }));
    expect(await asActor(reporter, () => attachBugPdfAction(data))).toMatchObject({ ok: false, code: 'invalid_input' });
  }
  data.set('pdf', new File(['%PDF-1.7\n<< /OpenAction [3 0 R /Fit] >>\n%%EOF'], 'synthetic.pdf', { type: 'text/plain' }));
  const uploaded = await asActor(reporter, () => attachBugPdfAction(data)); expect(uploaded).toMatchObject({ ok: true, data: { kind: 'report_pdf', mimeType: 'application/pdf' } });
  expect(await asActor(reporter, () => attachBugPdfAction(data))).toEqual(uploaded);
  expect(await db.select().from(bugReports)).toHaveLength(1); expect(await db.select().from(bugReportFiles)).toHaveLength(1);
  expect(JSON.stringify(uploaded)).not.toMatch(/content|base64/);
  data.append('pdf', new File(['%PDF-1.7'], 'duplicate.pdf')); expect(await asActor(reporter, () => attachBugPdfAction(data))).toMatchObject({ ok: false, code: 'invalid_input' });
  if (!uploaded.ok) throw new Error('upload');
  expect(await asActor(reporter, () => removeBugPdfAction({ fileId: uploaded.data.id, reason: 'Synthetic' }))).toMatchObject({ ok: false, code: 'forbidden' });
  expect(await asActor(triager, () => removeBugPdfAction({ fileId: uploaded.data.id, reason: ' ' }))).toMatchObject({ ok: false, code: 'invalid_input' });
  expect(await asActor(triager, () => removeBugPdfAction({ fileId: uploaded.data.id, reason: 'Synthetic' }))).toMatchObject({ ok: true, data: { removed: true, url: null } });
});

it('requires explicit bounded pending-PDF intent for attachment-only comment creation', async () => {
  const reporter = await createUser({ roles: ['bd'] });
  const saved = await asActor(reporter, () => createBugAction(form())); if (!saved.ok) throw new Error('setup');
  const data = new FormData(); data.set('bugId', saved.data.id); data.set('requestId', randomUUID());
  expect(await asActor(reporter, () => addBugCommentAction(data))).toMatchObject({ ok: false, code: 'invalid_input' });
  data.set('pendingPdf', 'false'); expect(await asActor(reporter, () => addBugCommentAction(data))).toMatchObject({ ok: false, code: 'invalid_input' });
  data.set('pendingPdf', 'true'); const result = await asActor(reporter, () => addBugCommentAction(data));
  expect(result).toMatchObject({ ok: true, data: { comment: { body: null, pendingPdf: true, pdf: null } } });
  expect(await asActor(reporter, () => addBugCommentAction(data))).toEqual(result);
});
it('creates optional-image reports from server identity and returns only an ID', async () => {
  const reporter = await createUser({ roles: ['intake_admin'] });
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'a'.repeat(40));
  const submitted = form();
  const result = await asActor(reporter, () => createBugAction(submitted));
  expect(result).toEqual({ ok: true, data: { id: expect.any(String) } });
  expect(await asActor(reporter, () => createBugAction(submitted))).toEqual(result);
  expect((await db.select().from(bugReports))[0]).toMatchObject({ reporterUserId: reporter.id, appBuildSha: 'a'.repeat(40), pageQuery: 'status=new' });
  expect(revalidatePath).toHaveBeenCalledWith('/bugs');
  expect(await db.select().from(events)).toHaveLength(1);
});
it('rejects unknown metadata, duplicate fields, multiple files and malformed image atomically', async () => {
  const reporter = await createUser({ roles: ['bd'] });
  const forged = form({ reporterUserId: reporter.id });
  const duplicate = form(); duplicate.append('summary','second');
  const images = form(); images.append('image',new File(['bad'],'one.png')); images.append('image',new File(['bad'],'two.png'));
  for (const bad of [forged,duplicate,images,form({ image: new File(['<svg/>'],'fake.png',{ type:'image/png' }) }),form({ summary: 'x'.repeat(201) })]) expect(await asActor(reporter, () => createBugAction(bad))).toMatchObject({ ok: false, code: 'invalid_input' });
  expect(await db.select().from(bugReports)).toHaveLength(0);
  expect(await db.select().from(bugReportImages)).toHaveLength(0);
});
it('commits before scheduling and preserves success on drain failure', async () => {
  const reporter = await createUser({ roles:['bd'] });
  const triager = await createUser({ roles:['md'] });
  await db.insert(chatWebhooks).values({ userId: triager.id, status: 'active', encryptedUrl: 'synthetic-sealed', googleSpaceName: 'spaces/synthetic', verifiedAt: new Date() });
  const transaction = vi.spyOn(db, 'transaction');
  let transactionStateAtSchedule: string | undefined;
  let transactionResultAtSchedule: unknown;
  let rowsAtSchedule: Promise<[typeof bugReports.$inferSelect[], typeof chatMessages.$inferSelect[]]> | undefined;
  vi.mocked(scheduleImmediateDrain).mockImplementation(() => {
    transactionStateAtSchedule = transaction.mock.settledResults.at(-1)?.type;
    transactionResultAtSchedule = transaction.mock.settledResults.at(-1)?.value;
    // Read through the independent DB connection, not the business transaction.
    rowsAtSchedule = Promise.all([db.select().from(bugReports), db.select().from(chatMessages)]);
    throw new Error('synthetic schedule failure');
  });
  try {
    expect(await asActor(reporter, () => { transaction.mockClear(); return createBugAction(form()); })).toMatchObject({ ok:true });
    expect(scheduleImmediateDrain).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledOnce();
    expect(transactionStateAtSchedule).toBe('fulfilled');
    expect(rowsAtSchedule).toBeDefined();
    const [reports, messages] = (await rowsAtSchedule)!;
    expect(reports).toMatchObject([{ reporterUserId: reporter.id, status: 'new' }]);
    expect(transactionResultAtSchedule).toEqual({ id: reports[0].id });
    expect(messages).toMatchObject([{ kind: 'bug_reported', recipientUserId: triager.id, status: 'pending' }]);
  } finally {
    transaction.mockRestore();
  }
  expect(await db.select().from(bugReports)).toHaveLength(1);
  expect(await db.select().from(chatMessages)).toMatchObject([{ kind: 'bug_reported', recipientUserId: triager.id, status: 'pending' }]);
  expect(await db.select().from(outboxJobs)).toMatchObject([{ jobType: 'chat.message.send' }]);
});
it('does not conceal a failed business transaction or schedule partial work', async () => {
  const reporter = await createUser({ roles: ['bd'] }); const triager = await createUser({ roles: ['md'] });
  const saved = await asActor(reporter, () => createBugAction(form())); if (!saved.ok) throw new Error('setup');
  // Only the reporter has a destination, so setup enqueues no new-report notice.
  await db.insert(chatWebhooks).values({ userId: reporter.id, status: 'active', encryptedUrl: 'synthetic-sealed', googleSpaceName: 'spaces/synthetic', verifiedAt: new Date() });
  vi.mocked(scheduleImmediateDrain).mockClear();
  const appendEvent = eventAppend.appendEvent;
  let rowsBeforeFailure: { messages: typeof chatMessages.$inferSelect[]; jobs: typeof outboxJobs.$inferSelect[]; history: typeof bugReportStatusChanges.$inferSelect[] } | undefined;
  const audit = vi.spyOn(eventAppend, 'appendEvent').mockImplementation(async (executor, input) => {
    if (input.type === 'bug.priority_changed') {
      // updateBug enqueues the valid status transition before auditing priority.
      rowsBeforeFailure = {
        messages: await executor.select().from(chatMessages),
        jobs: await executor.select().from(outboxJobs),
        history: await executor.select().from(bugReportStatusChanges).where(eq(bugReportStatusChanges.toStatus, 'in_progress')),
      };
      throw new Error('synthetic audit failure after enqueue');
    }
    return appendEvent(executor, input);
  });
  let result;
  try {
    result = await asActor(triager, () => updateBugAction({ bugId: saved.data.id, expectedVersion: 1, patch: { status: 'in_progress', priority: 'high' } }));
  } finally {
    audit.mockRestore();
  }
  expect(rowsBeforeFailure).toMatchObject({
    messages: [{ kind: 'bug_status_changed', recipientUserId: reporter.id, status: 'pending' }],
    jobs: [{ jobType: 'chat.message.send' }],
    history: [{ bugReportId: saved.data.id, fromStatus: 'new', toStatus: 'in_progress' }],
  });
  expect(result.ok).toBe(false);
  expect(result).toMatchObject({ ok: false, code: 'internal_error' });
  expect(scheduleImmediateDrain).not.toHaveBeenCalled();
  expect(await db.select().from(bugReports)).toMatchObject([{ id: saved.data.id, status: 'new', version: 1 }]); expect(await db.select().from(chatMessages)).toHaveLength(0); expect(await db.select().from(outboxJobs)).toHaveLength(0);
  expect(await db.select().from(bugReportStatusChanges).where(eq(bugReportStatusChanges.toStatus, 'in_progress'))).toHaveLength(0);
  expect(await db.select().from(bugReportStatusChanges)).toMatchObject([{ bugReportId: saved.data.id, fromStatus: null, toStatus: 'new' }]);
  expect(await db.select().from(events)).toMatchObject([{ type: 'bug.reported' }]);
});
it('returns a saved action before delivery and keeps that success through transport timeout', async () => {
  const reporter = await createUser({ roles: ['bd'] }); const triager = await createUser({ roles: ['md'] });
  await db.insert(chatWebhooks).values({ userId: triager.id, status: 'active', encryptedUrl: sealSecret('https://chat.example.test/v1/spaces/synthetic/messages?key=fake-key&token=fake-token', 'chat-webhook', triager.id, serverEnv.AUTH_SECRET), googleSpaceName: 'spaces/synthetic', verifiedAt: new Date() });
  const http: WebhookTransport & { send: ReturnType<typeof vi.fn<WebhookTransport['send']>> } = { mode: 'synthetic', send: vi.fn(async () => { throw new Error('synthetic timeout'); }) };
  const result = await asActor(reporter, () => createBugAction(form()));
  expect(result).toMatchObject({ ok: true, data: { id: expect.any(String) } }); expect(http.send).not.toHaveBeenCalled();
  const [message] = await db.select().from(chatMessages);
  const job: ClaimedJob = { id: randomUUID(), jobType: 'chat.message.send', aggregateType: 'chat_message', aggregateId: message.id, payload: { chatMessageId: message.id }, dedupeKey: message.id, attemptCount: 1, leaseOwner: 'test', leaseExpiresAt: new Date().toISOString() };
  await expect(handleChatMessageSend(job, new Date(), undefined, { transport: http })).rejects.toMatchObject({ retryAfterSeconds: null });
  expect(result.ok).toBe(true); expect(await db.select().from(bugReports)).toHaveLength(1); expect(await db.select().from(outboxJobs)).toHaveLength(1);
});
it('enforces owner and triage boundaries for comments, reads and updates', async () => {
  const reporter = await createUser({ roles:['bd'] }); const triager = await createUser({ roles:['md'] }); const stranger = await createUser({ roles:['bd'] });
  const result = await asActor(reporter, () => createBugAction(form())); if (!result.ok) throw new Error('setup'); const bugId = result.data.id;
  const comment = new FormData(); comment.set('bugId',bugId); comment.set('requestId',randomUUID()); comment.set('body','reply');
  expect(await asActor(stranger, () => addBugCommentAction(comment))).toMatchObject({ ok:false });
  expect(await asActor(reporter, () => updateBugAction({bugId,expectedVersion:1,patch:{status:'in_progress'}}))).toMatchObject({ok:false,code:'forbidden'});
  expect(await asActor(triager, () => addBugCommentAction(comment))).toMatchObject({ok:true});
  expect(await asActor(triager, () => markBugReadAction({bugId,seenActivitySeq:1}))).toMatchObject({ok:false});
  expect(await asActor(reporter, () => markBugReadAction({bugId,seenActivitySeq:1}))).toMatchObject({ok:true,data:{readSeq:1}});
  expect((await db.select().from(bugReports).where(eq(bugReports.id,bugId)))[0].reporterReadSeq).toBe(1);
  expect(await db.select().from(bugReportComments)).toHaveLength(1);
});
it('an invalid comment image or empty body creates no partial comment or activity', async () => {
  const reporter = await createUser({ roles:['bd'] });
  const result = await asActor(reporter, () => createBugAction(form())); if (!result.ok) throw new Error('setup');
  for (const withImage of [true,false]) {
    const data = new FormData(); data.set('bugId',result.data.id);data.set('requestId',randomUUID());
    if(withImage) data.set('image',new File(['bad'],'fake.png',{type:'image/png'}));
    expect(await asActor(reporter, () => addBugCommentAction(data))).toMatchObject({ok:false,code:'invalid_input'});
  }
  expect(await db.select().from(bugReportComments)).toHaveLength(0);
  expect(await db.select().from(bugReportImages)).toHaveLength(0);
});

it('stores sniffed screenshot and image-only comment atomically without exposing filenames or bytes', async () => {
  const reporter = await createUser({roles:['bd']});const triager = await createUser({roles:['md']});
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c63f80f040009fb03fdfb5e6b2b0000000049454e44ae426082','hex');
  const data = form({image:new File([png],'private-customer.svg',{type:'text/plain'})});
  const saved = await asActor(reporter,()=>createBugAction(data));
  expect(saved.ok).toBe(true);if(!saved.ok) throw new Error('setup');
  const comment = new FormData();comment.set('bugId',saved.data.id);comment.set('requestId',randomUUID());comment.set('image',new File([png],'private-customer.png',{type:'image/png'}));
  const result = await asActor(triager,()=>addBugCommentAction(comment));
  expect(result).toMatchObject({ok:true,data:{comment:{body:null,image:{mimeType:'image/png',url:expect.stringContaining('/api/bugs/images/')}},activitySeq:1}});
  expect(await asActor(triager,()=>addBugCommentAction(comment))).toEqual(result);
  expect(await db.select().from(bugReportImages)).toHaveLength(2);
  expect(JSON.stringify(result)).not.toMatch(/private-customer|content|data:|base64/);
});
