import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { createUser } from "@/tests/fixtures/factories";
import { truncateAll } from "@/tests/setup/truncate";
import { db } from "@/src/server/db/client";
import { pgErrorCode } from "@/src/server/db/errors";
import { bugReports, bugReportComments, bugReportFiles, bugReportStatusChanges, bugReportImages, calendarFeeds, calendarEvents, chatMessages, chatWebhooks } from "@/src/server/db/schema";

beforeEach(truncateAll);

async function report() {
  const user = await createUser();
  const [row] = await db.insert(bugReports).values({ reporterUserId: user.id, requestId: randomUUID(), summary: "Synthetic report", pagePath: "/today", pageQuery: "", viewportWidth: 1280, viewportHeight: 720, userAgent: "synthetic" }).returning();
  return { user, row };
}
async function image() {
  const { user, row } = await report();
  const content = Buffer.from([137, 80, 78, 71]);
  const [stored] = await db.insert(bugReportImages).values({ bugReportId: row.id, kind: "screenshot", content, mimeType: "image/png", width: 1, height: 1, byteCount: content.byteLength, uploadedByUserId: user.id }).returning();
  return { user, row, stored, content };
}

it("defaults report counters and checks enums, version, input and unread bounds", async () => {
  const { row } = await report();
  expect(row).toMatchObject({ status: "new", priority: null, version: 1, reporterActivitySeq: 0, reporterReadSeq: 0, assignedToUserId: null });
  for (const patch of [
    { status: "unknown" }, { priority: "unknown" }, { version: 0 },
    { reporterReadSeq: -1 }, { reporterActivitySeq: -1 }, { reporterReadSeq: 1 },
    { summary: " " }, { summary: "s".repeat(201) }, { description: "x".repeat(4001) },
    { viewportWidth: 0 }, { viewportHeight: 16385 }, { userAgent: "x".repeat(2049) },
  ]) expect(pgErrorCode(await db.update(bugReports).set(patch as Partial<typeof bugReports.$inferInsert>).where(eq(bugReports.id, row.id)).catch((error: unknown) => error))).toBe("23514");
});

it("keeps request keys unique per actor and forbids cross-report comment images", async () => {
  const { user, row } = await report();
  expect(pgErrorCode(await db.insert(bugReports).values({ ...row, id: randomUUID() }).catch((error: unknown) => error))).toBe("23505");
  const other = await report();
  const [comment] = await db.insert(bugReportComments).values({ bugReportId: row.id, authorUserId: user.id, requestId: randomUUID(), body: "Synthetic" }).returning();
  expect(comment.reporterActivitySeq).toBe(0);
  expect(pgErrorCode(await db.insert(bugReportComments).values({ bugReportId: row.id, authorUserId: user.id, requestId: randomUUID(), body: "Synthetic", reporterActivitySeq: -1 }).catch((error: unknown) => error))).toBe("23514");
  expect(pgErrorCode(await db.insert(bugReportComments).values({ ...comment, id: randomUUID() }).catch((error: unknown) => error))).toBe("23505");
  expect(pgErrorCode(await db.insert(bugReportImages).values({ bugReportId: other.row.id, commentId: comment.id, kind: "comment", content: Buffer.from([1]), mimeType: "image/png", width: 1, height: 1, byteCount: 1, uploadedByUserId: user.id }).catch((error: unknown) => error))).toBe("23503");
});

it("stores bytea through postgres.js and retains one-way image tombstones", async () => {
  const { user, stored, content } = await image();
  expect(Buffer.isBuffer(stored.content)).toBe(true);
  expect(stored.content).toEqual(content);
  expect(pgErrorCode(await db.update(bugReportImages).set({ content: Buffer.from([2, 3, 4, 5]) }).where(eq(bugReportImages.id, stored.id)).catch((error: unknown) => error))).toBe("P0001");
  expect(pgErrorCode(await db.update(bugReportImages).set({ content: null }).where(eq(bugReportImages.id, stored.id)).catch((error: unknown) => error))).toBe("23514");
  const at = new Date();
  const [removed] = await db.update(bugReportImages).set({ content: null, removedAt: at, removedByUserId: user.id, removedReason: "Synthetic removal" }).where(eq(bugReportImages.id, stored.id)).returning();
  expect(removed).toMatchObject({ content: null, removedAt: at, removedByUserId: user.id, removedReason: "Synthetic removal", byteCount: content.byteLength });
  expect(pgErrorCode(await db.update(bugReportImages).set({ content, removedAt: null, removedByUserId: null, removedReason: null }).where(eq(bugReportImages.id, stored.id)).catch((error: unknown) => error))).toBe("P0001");
  expect(pgErrorCode(await db.update(bugReportImages).set({ width: 2 }).where(eq(bugReportImages.id, stored.id)).catch((error: unknown) => error))).toBe("P0001");
  expect(pgErrorCode(await db.update(bugReportImages).set({ removedAt: new Date(at.getTime() + 1000) }).where(eq(bugReportImages.id, stored.id)).catch((error: unknown) => error))).toBe("P0001");
  // Manual privacy redaction preserves the original evidence and may alter only free text.
  await db.update(bugReportImages).set({ removedReason: "[redacted]" }).where(eq(bugReportImages.id, stored.id));
});

it("requires cancellation reasons and finite status history while preserving redactable reason", async () => {
  const { user, row } = await report();
  const base = { bugReportId: row.id, changedByUserId: user.id, fromStatus: "new" as const, toStatus: "cancelled" as const };
  for (const reason of [null, " ", "x".repeat(501)]) expect(pgErrorCode(await db.insert(bugReportStatusChanges).values({ ...base, reason }).catch((error: unknown) => error))).toBe("23514");
  expect(pgErrorCode(await db.insert(bugReportStatusChanges).values({ ...base, fromStatus: null, toStatus: "done" }).catch((error: unknown) => error))).toBe("23514");
  expect(pgErrorCode(await db.insert(bugReportStatusChanges).values({ ...base, fromStatus: "done", toStatus: "cancelled", reason: "invalid transition" }).catch((error: unknown) => error))).toBe("23514");
  const [history] = await db.insert(bugReportStatusChanges).values({ ...base, reason: "duplicate" }).returning();
  await db.update(bugReportStatusChanges).set({ reason: "[redacted]" }).where(eq(bugReportStatusChanges.id, history.id));
  expect(await db.select().from(bugReportStatusChanges)).toEqual([{ ...history, reason: "[redacted]" }]);
});

it.each(["bug_reports", "bug_report_comments", "bug_report_status_changes", "bug_report_images", "bug_report_files"])("protects %s with RLS, no policies and DELETE/TRUNCATE guards", async (table) => {
  const { user, row } = await image();
  await db.insert(bugReportComments).values({ bugReportId: row.id, authorUserId: user.id, requestId: randomUUID(), body: "Synthetic" });
  await db.insert(bugReportStatusChanges).values({ bugReportId: row.id, changedByUserId: user.id, fromStatus: null, toStatus: "new" });
  if (table === 'bug_report_files') await db.insert(bugReportFiles).values({ bugReportId: row.id, requestId: randomUUID(), kind: 'report_pdf', content: Buffer.from('%PDF-'), mimeType: 'application/pdf', fileName: 'synthetic.pdf', byteCount: 5, uploadedByUserId: user.id });
  const [flags] = await db.execute<{ rls: boolean; policies: number }>(sql`select c.relrowsecurity as rls, (select count(*)::int from pg_policies where schemaname='public' and tablename=${table}) as policies from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=${table}`);
  expect(flags).toEqual({ rls: true, policies: 0 });
  const triggers = await db.execute<{ name: string; function: string; type: number }>(sql`
    select t.tgname as name, p.proname as function, t.tgtype::int as type
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=${table} and not t.tgisinternal order by t.tgname
  `);
  expect(triggers).toEqual([
    { name: `${table}_forbid_delete`, function: "forbid_delete", type: 11 },
    { name: `${table}_forbid_truncate`, function: "forbid_truncate", type: 34 },
    ...(table === "bug_report_images" ? [{ name: "bug_report_images_update_guard", function: "bug_image_update_guard", type: 19 }] : []),
    ...(table === "bug_report_files" ? [{ name: "bug_report_files_update_guard", function: "bug_file_update_guard", type: 19 }] : []),
  ]);
  expect(pgErrorCode(await db.execute(sql`delete from ${sql.identifier(table)}`).catch((error: unknown) => error))).toBe("P0001");
  expect(pgErrorCode(await db.execute(sql`truncate table ${sql.identifier(table)} cascade`).catch((error: unknown) => error))).toBe("P0001");
  const counts: number[] = [];
  await expect(db.transaction(async (tx) => {
    await tx.execute(sql`create role r19_bug_probe nologin`);
    await tx.execute(sql`grant usage on schema public to r19_bug_probe`);
    await tx.execute(sql`grant select on all tables in schema public to r19_bug_probe`);
    await tx.execute(sql`set local role r19_bug_probe`);
    const [{ n }] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)}`);
    counts.push(n); tx.rollback();
  })).rejects.toThrow("Rollback");
  expect(counts).toEqual([0]);
});

it("applies the additive R19 migration over retained R18 credentials/messages/calendar", async () => {
  const migration = readFileSync("db/migrations/0001_bug_reports.sql", "utf8");
  await expect(db.transaction(async (tx) => {
    const user = await createUser();
    const [hook] = await tx.insert(chatWebhooks).values({ userId: user.id, status: "active", encryptedUrl: "sealed", googleSpaceName: "spaces/test", verifiedAt: new Date() }).returning();
    const [feed] = await tx.insert(calendarFeeds).values({ userId: user.id, tokenHash: "d".repeat(64), encryptedToken: "sealed" }).returning();
    const [message] = await tx.insert(chatMessages).values({ dedupeKey: randomUUID(), kind: "owner_lead", recipientUserId: user.id, spaceName: "spaces/test", subjectType: "lead", subjectId: randomUUID(), notification: "default", payload: {}, transport: "webhook", webhookId: hook.id, webhookRevision: hook.credentialRevision }).returning();
    const [calendar] = await tx.insert(calendarEvents).values({ ownerUserId: user.id, subjectType: "follow_up", subjectId: randomUUID(), googleEventId: "existing", summary: "synthetic", startAt: new Date(), endAt: new Date() }).returning();
    for (const table of ["bug_report_files", "bug_report_images", "bug_report_status_changes", "bug_report_comments", "bug_reports"]) await tx.execute(sql`drop table ${sql.identifier(table)}`);
    await tx.execute(sql`drop function public.bug_image_update_guard()`);
    for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) await tx.execute(sql.raw(statement));
    expect(await tx.select().from(chatWebhooks)).toEqual([hook]); expect(await tx.select().from(calendarFeeds)).toEqual([feed]);
    expect(await tx.select().from(chatMessages)).toEqual([message]); expect(await tx.select().from(calendarEvents)).toEqual([calendar]);
    tx.rollback();
  })).rejects.toThrow("Rollback");
});
