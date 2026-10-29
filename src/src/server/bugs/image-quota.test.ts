import { randomUUID } from "node:crypto";
import { eq, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/src/server/auth/actor";
import { db, type Db } from "@/src/server/db/client";
import { createSqlClient } from "@/src/server/db/connection";
import * as schema from "@/src/server/db/schema";
import { bugReportComments, bugReportFiles, bugReportImages, bugReports } from "@/src/server/db/schema/bugs";
import { buildTestActor } from "@/tests/fixtures/actor";
import { createUser } from "@/tests/fixtures/factories";
import { setRolePermissions } from '@/tests/fixtures/role-permissions';
import { truncateAll } from "@/tests/setup/truncate";
import { addBugComment, createBug } from "./commands";
import { checkBugImageQuota, lockBugQuota } from "./rate-limit";
import { attachBugPdf } from './files';

beforeEach(truncateAll);
const connections: ReturnType<typeof createSqlClient>[] = [];
const activeScenarios = new Set<Promise<void>>();
afterEach(async () => {
  // Vitest timing out does not cancel the test's async work. Drain it before the
  // next truncate, and close dedicated connections to unblock failed DB setup.
  await Promise.all([
    Promise.allSettled([...activeScenarios]),
    ...connections.splice(0).map((client) => client.end({ timeout: 5 })),
  ]);
});
const context = { pagePath: "/bugs/mine", pageQuery: "", viewportWidth: 800, viewportHeight: 600,
  userAgent: "Synthetic quota", osName: null, osVersion: null, browserName: null, browserVersion: null,
  deviceType: null, appBuildSha: null };
const now = new Date("2000-01-01T00:00:00Z"); // Request time must never set the rolling quota's clock.
const correlationId = "synthetic-image-quota";
const image = (byteCount: number) => ({ content: Buffer.alloc(byteCount), mimeType: "image/png" as const, width: 1, height: 1, byteCount });

function connection(): Db {
  const client = createSqlClient(process.env.DATABASE_URL!, 1);
  connections.push(client);
  return drizzle(client, { schema });
}
async function quotaScenario(run: () => Promise<void>): Promise<void> {
  const running = run();
  activeScenarios.add(running);
  try { await running; } finally { activeScenarios.delete(running); }
}
async function quotaReady<T>(signal: AbortSignal, ready: Promise<T>, transaction: Promise<unknown>): Promise<T> {
  signal.throwIfAborted();
  let abort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    // A failed transaction must not leave an unresolved readiness barrier.
    return await Promise.race([ready, transaction.then(() => { throw new Error('quota_transaction_finished_before_ready'); }), cancelled]);
  } finally { signal.removeEventListener('abort', abort); }
}
async function reporter(): Promise<Actor> { return buildTestActor((await createUser({ roles: ["intake_admin"] })).id); }
async function create(actor: Actor, byteCount?: number, requestId = randomUUID(), database = db) {
  return database.transaction((tx) => createBug(tx, { actor, context, input: { requestId, summary: "Synthetic image quota" },
    image: byteCount ? image(byteCount) : null, now, correlationId }));
}
async function comment(actor: Actor, bugId: string, byteCount: number, requestId = randomUUID(), database = db) {
  return database.transaction((tx) => addBugComment(tx, { actor, bugId, input: { requestId, body: "Synthetic image quota" },
    image: image(byteCount), now, correlationId }));
}
async function storedBytes(userId: string): Promise<number> {
  const [row] = await db.select({ total: sql<number>`coalesce(sum(${bugReportImages.byteCount}), 0)`.mapWith(Number) })
    .from(bugReportImages).where(eq(bugReportImages.uploadedByUserId, userId));
  return row.total;
}

/** Removed images keep their original byte counts, without allocating 50 MiB in each fixture. */
async function seedUsage(userId: string, total: number, createdAt: Date | SQL = sql`clock_timestamp() - interval '1 hour'`) {
  await db.transaction(async (tx) => {
    for (let index = 0, remaining = total; remaining > 0; index++) {
      const byteCount = Math.min(2_097_152, remaining);
      const [report] = await tx.insert(bugReports).values({ ...context, reporterUserId: userId,
        requestId: randomUUID(), summary: "Synthetic previous upload", createdAt: sql`clock_timestamp() - interval '1 hour'` }).returning();
      const [reply] = index % 2 ? await tx.insert(bugReportComments).values({ bugReportId: report.id, authorUserId: userId,
        requestId: randomUUID(), body: "Synthetic previous upload", createdAt: sql`clock_timestamp() - interval '1 hour'` }).returning() : [];
      await tx.insert(bugReportImages).values({ bugReportId: report.id, commentId: reply?.id ?? null,
        kind: reply ? "comment" : "screenshot", content: null, mimeType: "image/png", width: 1, height: 1, byteCount,
        uploadedByUserId: userId, createdAt, removedByUserId: userId, removedAt: sql`clock_timestamp()`, removedReason: "Synthetic removed image" });
      remaining -= byteCount;
    }
  });
}

describe("per-user rolling image byte quota", () => {
  it('reloads upload grants after waiting for the shared actor lock', ({ signal }) => quotaScenario(async () => {
    const actor = await reporter(); const parent = await create(actor);
    signal.throwIfAborted();
    let release!: () => void; let ready!: () => void; let identify!: (pid: number) => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const firstReady = new Promise<void>(resolve => { ready = resolve; });
    const secondPid = new Promise<number>(resolve => { identify = resolve; });
    signal.addEventListener('abort', release, { once: true });
    const first = connection().transaction(async tx => { await lockBugQuota(tx, actor.userId, 'report'); ready(); await held; });
    let second: Promise<unknown> | undefined; let waiting = false;
    try {
      await quotaReady(signal, firstReady, first);
      signal.throwIfAborted();
      const content = Buffer.from('%PDF-1.7\n%%EOF'); let settled = false;
      second = connection().transaction(async tx => {
        const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`); identify(row.pid);
        return attachBugPdf(tx, { actor, bugId: parent.id, requestId: randomUUID(), pdf: { content, byteCount: content.length, mimeType: 'application/pdf', fileName: 'synthetic.pdf' }, now, correlationId });
      });
      void second.then(() => { settled = true; }, () => { settled = true; });
      const pid = await quotaReady(signal, secondPid, second);
      for (let attempt = 0; attempt < 100 && !settled && !waiting; attempt++) {
        signal.throwIfAborted();
        const [row] = await db.execute<{ waiting: boolean }>(sql`select exists(select 1 from pg_locks where pid=${pid} and locktype='advisory' and not granted) as waiting, pg_sleep(0.01)`); waiting = row.waiting;
      }
      signal.throwIfAborted();
      await setRolePermissions({ intake_admin: { 'bugs.report': false, 'bugs.triage': false } });
    } finally {
      release();
      await Promise.allSettled([first, second]);
      signal.removeEventListener('abort', release);
    }
    signal.throwIfAborted();
    const results = await Promise.allSettled([first, second]);
    expect(waiting).toBe(true); expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'bug_not_visible' } });
    expect(await db.select().from(bugReportFiles)).toHaveLength(0);
  }));
  it('counts PDF tombstones in image/report quota and never makes removed capacity reusable', async () => {
    const actor = await reporter(); const parent = await create(actor);
    for (let remaining = 52_428_800; remaining > 0;) {
      const byteCount = Math.min(4_194_304, remaining);
      const [report] = await db.insert(bugReports).values({ ...context, reporterUserId: actor.userId, requestId: randomUUID(), summary: 'Synthetic previous PDF', createdAt: sql`clock_timestamp() - interval '1 hour'` }).returning();
      await db.insert(bugReportFiles).values({ bugReportId: report.id, requestId: randomUUID(), kind: 'report_pdf', content: null, mimeType: 'application/pdf', fileName: 'synthetic.pdf', byteCount,
        uploadedByUserId: actor.userId, createdAt: sql`clock_timestamp() - interval '1 hour'`, removedByUserId: actor.userId, removedAt: new Date(), removedReason: 'Synthetic removal' });
      remaining -= byteCount;
    }
    await expect(create(actor, 1)).rejects.toMatchObject({ code: 'bug_image_quota_exceeded' });
    await expect(comment(actor, parent.id, 1)).rejects.toMatchObject({ code: 'bug_image_quota_exceeded' });
    expect(await db.select().from(bugReportImages)).toHaveLength(0);
    await expect(create(actor)).resolves.toHaveProperty('id');
  });

  it('serializes mixed PDF and image writers at the shared quota boundary', ({ signal }) => quotaScenario(async () => {
    const actor = await reporter(); await seedUsage(actor.userId, 50_331_648); const parent = await create(actor);
    signal.throwIfAborted();
    const content = Buffer.alloc(2_097_152); content.write('%PDF-1.7');
    let release!: () => void; let ready!: () => void; let identify!: (pid: number) => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const firstReady = new Promise<void>(resolve => { ready = resolve; });
    const secondPid = new Promise<number>(resolve => { identify = resolve; });
    signal.addEventListener('abort', release, { once: true });
    const requestId = randomUUID();
    const first = connection().transaction(async tx => {
      const saved = await attachBugPdf(tx, { actor, bugId: parent.id, requestId, pdf: { content, byteCount: content.length, mimeType: 'application/pdf', fileName: 'synthetic.pdf' }, now, correlationId });
      ready(); await held; return saved;
    });
    let second: Promise<unknown> | undefined; let waiting = false;
    try {
      await quotaReady(signal, firstReady, first);
      signal.throwIfAborted();
      let secondSettled = false;
      second = connection().transaction(async tx => {
        const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`); identify(row.pid);
        return createBug(tx, { actor, context, input: { requestId: randomUUID(), summary: 'Synthetic concurrent image' }, image: image(2_097_152), now, correlationId });
      });
      void second.then(() => { secondSettled = true; }, () => { secondSettled = true; });
      const pid = await quotaReady(signal, secondPid, second);
      for (let attempt = 0; attempt < 100 && !secondSettled && !waiting; attempt++) {
        signal.throwIfAborted();
        const [row] = await db.execute<{ waiting: boolean }>(sql`select exists(select 1 from pg_locks where pid=${pid} and locktype='advisory' and not granted) as waiting, pg_sleep(0.01)`); waiting = row.waiting;
      }
    } finally {
      release();
      await Promise.allSettled([first, second]);
      signal.removeEventListener('abort', release);
    }
    signal.throwIfAborted();
    const results = await Promise.allSettled([first, second]);
    expect(waiting).toBe(true); expect(results[0]).toMatchObject({ status: 'fulfilled' });
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'bug_image_quota_exceeded' } });
    expect(await storedBytes(actor.userId)).toBe(50_331_648);
    expect(await db.select({ byteCount: bugReportFiles.byteCount }).from(bugReportFiles)).toEqual([{ byteCount: 2_097_152 }]);
    // The successful request remains replayable when the shared quota is full.
    await expect(db.transaction(tx => attachBugPdf(tx, { actor, bugId: parent.id, requestId, pdf: { content, byteCount: content.length, mimeType: 'application/pdf', fileName: 'synthetic.pdf' }, now, correlationId }))).resolves.toMatchObject({ id: results[0].status === 'fulfilled' ? results[0].value.id : '' });
  }));
  it("allows just under and exactly 50 MiB, then rejects report and comment images without partial writes", async () => {
    const actor = await reporter();
    await seedUsage(actor.userId, 50_331_647);
    const saved = await create(actor, 2_097_152);
    expect(await storedBytes(actor.userId)).toBe(52_428_799);
    await comment(actor, saved.id, 1);
    expect(await storedBytes(actor.userId)).toBe(52_428_800);
    const before = { reports: (await db.select().from(bugReports)).length, comments: (await db.select().from(bugReportComments)).length };
    await expect(create(actor, 1)).rejects.toMatchObject({ code: "bug_image_quota_exceeded" });
    await expect(comment(actor, saved.id, 1)).rejects.toMatchObject({ code: "bug_image_quota_exceeded" });
    expect((await db.select().from(bugReports)).length).toBe(before.reports);
    expect((await db.select().from(bugReportComments)).length).toBe(before.comments);
    expect(await storedBytes(actor.userId)).toBe(52_428_800);
    await expect(create(actor)).resolves.toHaveProperty("id");
    const other = await reporter();
    await expect(create(other, 1)).resolves.toHaveProperty("id");
  });

  it.each(["report", "comment"] as const)("replays a successful %s request at full quota without counting its bytes again", async (kind) => {
    const actor = await reporter();
    await seedUsage(actor.userId, 50_331_648);
    const parent = await create(actor);
    const requestId = randomUUID();
    const write = () => kind === "report" ? create(actor, 2_097_152, requestId) : comment(actor, parent.id, 2_097_152, requestId);
    const first = await write();
    expect(await write()).toEqual(first);
    expect(await storedBytes(actor.userId)).toBe(52_428_800);
    expect(await db.select({ id: bugReportImages.id }).from(bugReportImages)).toHaveLength(25);
  });

  it("expires uploads at exactly 24 hours, includes the closed upper boundary and excludes future uploads", async () => {
    const actor = await reporter();
    const at = new Date("2026-10-27T03:00:00.000Z");
    await seedUsage(actor.userId, 52_428_800, new Date(at.getTime() - 86_400_000));
    await db.transaction(async (tx) => {
      await lockBugQuota(tx, actor.userId, "report");
      await expect(checkBugImageQuota(tx, actor.userId, 1, at)).resolves.toBeUndefined();
      await expect(checkBugImageQuota(tx, actor.userId, 1, new Date(at.getTime() - 1)))
        .rejects.toMatchObject({ code: "bug_image_quota_exceeded" });
    });
    const future = await reporter();
    await seedUsage(future.userId, 52_428_800, new Date(at.getTime() + 1));
    await db.transaction(async (tx) => {
      await lockBugQuota(tx, future.userId, "comment");
      await expect(checkBugImageQuota(tx, future.userId, 1, at)).resolves.toBeUndefined();
      await expect(checkBugImageQuota(tx, future.userId, 1, new Date(at.getTime() + 1)))
        .rejects.toMatchObject({ code: "bug_image_quota_exceeded" });
    });
  });

  it("counts microsecond-precision image timestamps against the database wall clock", async () => {
    const actor = await reporter();
    await seedUsage(actor.userId, 52_428_800, sql`clock_timestamp()`);
    await db.transaction(async (tx) => {
      await lockBugQuota(tx, actor.userId, "comment");
      await expect(checkBugImageQuota(tx, actor.userId, 1)).rejects.toMatchObject({ code: "bug_image_quota_exceeded" });
    });
  });

  it("serializes a report upload and comment upload on independent connections with one shared actor lock", async () => {
    const actor = await reporter();
    await seedUsage(actor.userId, 50_331_648);
    const parent = await create(actor);
    let release!: () => void;
    let ready!: () => void;
    let identify!: (pid: number) => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const firstReady = new Promise<void>((resolve) => { ready = resolve; });
    const secondPid = new Promise<number>((resolve) => { identify = resolve; });
    const first = connection().transaction(async (tx) => {
      const saved = await createBug(tx, { actor, context, input: { requestId: randomUUID(), summary: "Synthetic concurrent report" },
        image: image(2_097_152), now, correlationId });
      ready();
      await held;
      return saved;
    });
    await firstReady;
    let secondSettled = false;
    const second = connection().transaction(async (tx) => {
      const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      identify(row.pid);
      return addBugComment(tx, { actor, bugId: parent.id, input: { requestId: randomUUID(), body: "Synthetic concurrent reply" },
        image: image(2_097_152), now, correlationId });
    });
    // Observe the second process reaching the actor lock while the first image is uncommitted.
    void second.then(() => { secondSettled = true; }, () => { secondSettled = true; });
    const pid = await secondPid;
    let waiting = false;
    try {
      for (let attempt = 0; attempt < 100 && !secondSettled && !waiting; attempt++) {
        const [row] = await db.execute<{ waiting: boolean }>(sql`
          select exists (select 1 from pg_locks where pid = ${pid} and locktype = 'advisory' and not granted) as waiting,
            pg_sleep(0.01)
        `);
        waiting = row.waiting;
      }
    } finally { release(); }
    const results = await Promise.allSettled([first, second]);
    expect(waiting).toBe(true);
    expect(results[0]).toMatchObject({ status: "fulfilled" });
    expect(results[1]).toMatchObject({ status: "rejected", reason: { code: "bug_image_quota_exceeded" } });
    expect(await storedBytes(actor.userId)).toBe(52_428_800);
  });
});
