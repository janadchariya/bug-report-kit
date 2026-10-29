import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as actors from "@/src/server/auth/actor";
import { db } from "@/src/server/db/client";
import { createSqlClient } from "@/src/server/db/connection";
import * as schema from "@/src/server/db/schema";
import { bugReportComments, bugReportFiles, bugReportImages, bugReports, bugReportStatusChanges } from "@/src/server/db/schema/bugs";
import { buildTestActor } from "@/tests/fixtures/actor";
import { createUser } from "@/tests/fixtures/factories";
import { setRolePermissions } from "@/tests/fixtures/role-permissions";
import { truncateAll } from "@/tests/setup/truncate";
import { getBugDetail, listBugs, loadBugThread } from "./queries";
import { markBugRead } from "./commands";
import { attachBugPdf, removeBugPdf } from "./files";

beforeEach(truncateAll);
afterEach(() => vi.restoreAllMocks());
const AT = new Date("2026-10-27T03:00:00.000Z");

async function fixture() {
  const reporter = await buildTestActor((await createUser({ roles: ["external_referrer"], displayName: "Synthetic Reporter" })).id);
  const stranger = await buildTestActor((await createUser({ roles: ["seller_assist"] })).id);
  const triager = await buildTestActor((await createUser({ roles: ["md"], displayName: "Synthetic Triager" })).id);
  const makeReport = async (reporterUserId = reporter.userId, over: Partial<typeof bugReports.$inferInsert> = {}) => {
    const [report] = await db.insert(bugReports).values({
      reporterUserId, requestId: randomUUID(), summary: "Synthetic report", description: "Private description sentinel",
      pagePath: "/bugs/mine", pageQuery: "", viewportWidth: 800, viewportHeight: 600,
      userAgent: "Private UA sentinel", createdAt: AT, updatedAt: AT, ...over,
    }).returning();
    return report;
  };
  const report = await makeReport();
  return { reporter, stranger, triager, report, makeReport };
}

describe("private bug projections and keyset pagination", () => {
  it("limits Mine to the actor even for triagers and requires triage for the queue", async () => {
    const f = await fixture();
    const own = await f.makeReport(f.triager.userId);
    expect((await getBugDetail(db, { actor: f.triager, scope: "triage", bugId: own.id })).isOwner).toBe(true);
    expect((await getBugDetail(db, { actor: f.triager, scope: "triage", bugId: f.report.id })).isOwner).toBe(false);
    expect((await getBugDetail(db, { actor: f.reporter, scope: "mine", bugId: f.report.id })).isOwner).toBe(true);
    expect((await listBugs(db, { actor: f.reporter, scope: "mine" })).items.map((row) => row.id)).toEqual([f.report.id]);
    expect((await listBugs(db, { actor: f.triager, scope: "mine" })).items.map((row) => row.id)).toEqual([own.id]);
    expect((await listBugs(db, { actor: f.triager, scope: "triage" })).items).toHaveLength(2);
    await expect(listBugs(db, { actor: f.reporter, scope: "triage" })).rejects.toMatchObject({ code: "bug_not_visible" });
    await expect(getBugDetail(db, { actor: f.triager, scope: "mine", bugId: f.report.id })).rejects.toMatchObject({ code: "bug_not_visible" });
    await expect(getBugDetail(db, { actor: f.stranger, scope: "mine", bugId: f.report.id })).rejects.toMatchObject({ code: "bug_not_visible" });
    await expect(loadBugThread(db, { actor: f.stranger, scope: "mine", bugId: f.report.id })).rejects.toMatchObject({ code: "bug_not_visible" });
    await expect(getBugDetail(db, { actor: f.reporter, scope: "mine", bugId: "invalid-id" })).rejects.toMatchObject({ code: "bug_not_visible" });
  });

  it("selects safe list fields and never exposes descriptions, raw UA, bytes or staff metadata on Mine", async () => {
    const f = await fixture();
    const mine = (await listBugs(db, { actor: f.reporter, scope: "mine" })).items[0];
    expect(mine.createdAt).toBe(AT.toISOString());
    expect(mine).not.toHaveProperty("description");
    expect(mine).not.toHaveProperty("userAgent");
    expect(mine).not.toHaveProperty("reporter");
    expect(mine).not.toHaveProperty("assignee");
    const serialized = JSON.stringify(mine);
    expect(serialized).not.toMatch(/Private description|Private UA|content|base64|data:/);
    const triage = (await listBugs(db, { actor: f.triager, scope: "triage" })).items[0];
    expect(triage.reporter).toMatchObject({ id: f.reporter.userId, displayName: "Synthetic Reporter" });
    expect(triage.reporter).not.toHaveProperty("email");
    const statements: string[] = [];
    const client = createSqlClient(process.env.DATABASE_URL!, 1);
    try {
      const traced = drizzle(client, { schema, logger: { logQuery: (query) => { statements.push(query); } } });
      await listBugs(traced, { actor: f.reporter, scope: "mine" });
      expect(statements.filter((statement) => statement.includes('from "bug_reports"')).join(" ")).not.toMatch(/"description"|"user_agent"|"content"/);
      expect(statements.join(" ")).toContain('join "bug_report_images"');
      expect(statements.join(" ")).not.toContain('"content"');
    } finally { await client.end({ timeout: 5 }); }
  });

  it("omits other users' identities from Mine lists, detail and older thread pages while retaining triage identities", async () => {
    const f = await fixture();
    await db.update(bugReports).set({ assignedToUserId: f.triager.userId }).where(eq(bugReports.id, f.report.id));
    const times = Array.from({ length: 52 }, (_, index) => new Date(AT.getTime() + index * 1000));
    await db.insert(bugReportComments).values(times.map((createdAt, index) => ({
      bugReportId: f.report.id, authorUserId: index % 2 ? f.triager.userId : f.stranger.userId,
      requestId: randomUUID(), body: `Private staff reply ${index}`, createdAt,
    })));
    await db.insert(bugReportStatusChanges).values(times.map((createdAt, index) => ({
      bugReportId: f.report.id, changedByUserId: index % 2 ? f.triager.userId : f.stranger.userId,
      fromStatus: index % 2 ? "done" as const : "in_progress" as const,
      toStatus: index % 2 ? "in_progress" as const : "done" as const, createdAt,
    })));
    await db.insert(bugReportComments).values({ bugReportId: f.report.id, authorUserId: f.reporter.userId,
      requestId: randomUUID(), body: "My own reply", createdAt: new Date(AT.getTime() + 52_000) });
    await db.insert(bugReportStatusChanges).values({ bugReportId: f.report.id, changedByUserId: f.reporter.userId,
      fromStatus: null, toStatus: "new", createdAt: new Date(AT.getTime() + 52_000) });

    const list = await listBugs(db, { actor: f.reporter, scope: "mine" });
    const detail = await getBugDetail(db, { actor: f.reporter, scope: "mine", bugId: f.report.id });
    const older = await loadBugThread(db, { actor: f.reporter, scope: "mine", bugId: f.report.id,
      commentsBefore: detail.commentsBefore!, historyBefore: detail.historyBefore! });
    for (const payload of [list, detail, older]) {
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain(f.triager.userId);
      expect(serialized).not.toContain(f.stranger.userId);
      expect(serialized).not.toMatch(/assignedToUserId|authorUserId|changedByUserId/);
    }
    expect(list.items[0]).toMatchObject({ assigned: true });
    expect(detail.comments.at(-1)).toMatchObject({ body: "My own reply", isMine: true });
    expect(detail.statusChanges.at(-1)).toMatchObject({ toStatus: "new", isMine: true });
    expect(detail.comments.slice(0, -1)).toEqual(expect.arrayContaining([expect.objectContaining({ isMine: false })]));
    expect(older.comments).toHaveLength(3);
    expect(older.statusChanges).toHaveLength(3);
    expect(older.comments.every((comment) => "isMine" in comment && comment.isMine === false)).toBe(true);
    expect(older.statusChanges.every((change) => "isMine" in change && change.isMine === false)).toBe(true);

    const triageList = await listBugs(db, { actor: f.triager, scope: "triage" });
    const triageDetail = await getBugDetail(db, { actor: f.triager, scope: "triage", bugId: f.report.id });
    const triageOlder = await loadBugThread(db, { actor: f.triager, scope: "triage", bugId: f.report.id,
      commentsBefore: triageDetail.commentsBefore!, historyBefore: triageDetail.historyBefore! });
    expect(triageList.items[0]).toMatchObject({ assigned: true, assignedToUserId: f.triager.userId });
    expect(triageDetail.comments).toEqual(expect.arrayContaining([expect.objectContaining({ authorUserId: f.triager.userId, isMine: true })]));
    expect(triageDetail.statusChanges).toEqual(expect.arrayContaining([expect.objectContaining({ changedByUserId: f.triager.userId, isMine: true })]));
    expect(triageOlder.comments).toEqual(expect.arrayContaining([expect.objectContaining({ authorUserId: f.stranger.userId, isMine: false })]));
    expect(triageOlder.statusChanges).toEqual(expect.arrayContaining([expect.objectContaining({ changedByUserId: f.stranger.userId, isMine: false })]));
  });

  it("searches summary case-insensitively with literal wildcard and escape characters", async () => {
    const f = await fixture();
    const literal = await f.makeReport(f.reporter.userId, { summary: "Save 50%_\\ failed" });
    await f.makeReport(f.reporter.userId, { summary: "Save 50-anything failed", description: "Save 50%_\\ failed" });
    const listed = await listBugs(db, { actor: f.triager, scope: "triage", q: "50%_\\" });
    expect(listed.items.map((row) => row.id)).toEqual([literal.id]);
    expect((await listBugs(db, { actor: f.triager, scope: "triage", q: "SAVE 50" })).items).toHaveLength(2);
    for (const q of ["", " ", "x".repeat(101)]) {
      await expect(listBugs(db, { actor: f.triager, scope: "triage", q })).rejects.toMatchObject({ code: "invalid_bug_filter" });
    }
  });

  it("joins only live screenshot ids, never bytes or comment images, without dropping reports", async () => {
    const f = await fixture();
    const bytes = Buffer.from("private thumbnail bytes sentinel");
    const [image] = await db.insert(bugReportImages).values({ bugReportId: f.report.id, kind: "screenshot", content: bytes,
      mimeType: "image/png", width: 1, height: 1, byteCount: bytes.byteLength, uploadedByUserId: f.reporter.userId,
    }).returning({ id: bugReportImages.id });
    const noImage = await f.makeReport();
    for (const [scope, actor] of [["triage", f.triager], ["mine", f.reporter]] as const) {
      const listed = await listBugs(db, { actor, scope });
      expect(listed.items.find((row) => row.id === f.report.id)?.screenshotImageId).toBe(image.id);
      expect(listed.items.find((row) => row.id === noImage.id)?.screenshotImageId).toBeNull();
      expect(JSON.stringify(listed)).not.toMatch(/private thumbnail bytes sentinel|"content"|base64|data:/);
    }
    await db.update(bugReportImages).set({ content: null, removedAt: AT, removedByUserId: f.triager.userId,
      removedReason: "Synthetic privacy removal" }).where(eq(bugReportImages.id, image.id));
    const listed = await listBugs(db, { actor: f.triager, scope: "triage" });
    expect(listed.items.find((row) => row.id === f.report.id)?.screenshotImageId).toBeNull();
  });

  it("includes raw user agent only in the guarded triage detail projection", async () => {
    const f = await fixture();
    expect(await getBugDetail(db, { actor: f.triager, scope: "triage", bugId: f.report.id })).toMatchObject({ userAgent: "Private UA sentinel" });
    expect(await getBugDetail(db, { actor: f.reporter, scope: "mine", bugId: f.report.id })).not.toHaveProperty("userAgent");
  });

  it("uses status, priority and assignee filters and stable timestamp/ID cursors", async () => {
    const f = await fixture();
    const reports = await Promise.all(Array.from({ length: 7 }, () => f.makeReport(f.reporter.userId, {
      status: "in_progress", priority: "high", assignedToUserId: f.triager.userId,
    })));
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listBugs(db, { actor: f.triager, scope: "triage", status: "in_progress", priority: "high", assigneeId: f.triager.userId, limit: 3, cursor });
      ids.push(...page.items.map((row) => row.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(ids).toEqual(reports.map((report) => report.id).sort().reverse());
    expect(new Set(ids).size).toBe(7);
    await expect(listBugs(db, { actor: f.triager, scope: "triage", cursor: "not-a-cursor" })).rejects.toMatchObject({ code: "invalid_bug_cursor" });
  });

  it("rechecks queue permission and hides revoked report permission using an existing actor", async () => {
    const f = await fixture();
    await setRolePermissions({ external_referrer: { "bugs.report": false }, md: { "bugs.triage": false } });
    await expect(listBugs(db, { actor: f.reporter, scope: "mine" })).rejects.toMatchObject({ code: "bug_not_visible" });
    await expect(getBugDetail(db, { actor: f.triager, scope: "triage", bugId: f.report.id })).rejects.toMatchObject({ code: "bug_not_visible" });
  });

  it("keeps sub-millisecond rows reachable through an opaque cursor", async () => {
    const f = await fixture();
    const older = await f.makeReport(), newer = await f.makeReport();
    await db.update(bugReports).set({ createdAt: sql`'2026-10-27T03:01:00.000001Z'::timestamptz` }).where(eq(bugReports.id, older.id));
    await db.update(bugReports).set({ createdAt: sql`'2026-10-27T03:01:00.000002Z'::timestamptz` }).where(eq(bugReports.id, newer.id));
    const first = await listBugs(db, { actor: f.reporter, scope: "mine", limit: 1 });
    const second = await listBugs(db, { actor: f.reporter, scope: "mine", limit: 1, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).not.toBe(first.items[0].id);
    // Both DTO dates may round to the same millisecond; the cursor must still distinguish them.
    expect(second.items[0].createdAt).toBe(first.items[0].createdAt);
  });

  it("retains unavailable historical assignee labels while current eligibility is revoked", async () => {
    const f = await fixture();
    await db.update(bugReports).set({ assignedToUserId: f.triager.userId }).where(eq(bugReports.id, f.report.id));
    const otherTriager = await buildTestActor((await createUser({ roles: ["system_admin"] })).id);
    await setRolePermissions({ md: { "bugs.triage": false } });
    const item = (await listBugs(db, { actor: otherTriager, scope: "triage" })).items[0];
    expect(item.assignee).toMatchObject({ id: f.triager.userId, displayName: "Synthetic Triager", available: false });
  });
});

describe("displayed detail activity snapshot", () => {
  it("surfaces a late PDF on an old comment before acknowledging its activity and keeps every comment reachable", async () => {
    const f = await fixture();
    const comments = await db.insert(bugReportComments).values(Array.from({ length: 61 }, (_, index) => ({
      bugReportId: f.report.id, authorUserId: f.triager.userId, requestId: randomUUID(),
      body: index === 0 ? null : `Newer reply ${index}`, pendingPdf: index === 0,
      reporterActivitySeq: index + 1, createdAt: new Date(AT.getTime() + index * 1000),
    }))).returning();
    await db.update(bugReports).set({ reporterActivitySeq: 61 }).where(eq(bugReports.id, f.report.id));
    const before = await getBugDetail(db, { actor: f.reporter, scope: "mine", bugId: f.report.id });
    expect(before.comments).toHaveLength(50);
    expect(before.comments.some(comment => comment.id === comments[0].id)).toBe(false);
    await db.transaction(tx => markBugRead(tx, { actor: f.reporter, bugId: f.report.id, seenActivitySeq: before.seenActivitySeq, now: new Date() }));

    const content = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF");
    const requestId = randomUUID();
    const upload = () => db.transaction(tx => attachBugPdf(tx, {
      actor: f.triager, bugId: f.report.id, commentId: comments[0].id, requestId,
      pdf: { content, byteCount: content.length, mimeType: "application/pdf", fileName: "late.pdf" },
      now: new Date(), correlationId: "test",
    }));
    const pdf = await upload();
    expect(await upload()).toEqual(pdf);
    // Replaying the old visible window cannot clear the newly arrived attachment.
    expect(await db.transaction(tx => markBugRead(tx, { actor: f.reporter, bugId: f.report.id,
      seenActivitySeq: before.seenActivitySeq, now: new Date() }))).toEqual({ readSeq: 61, activitySeq: 62 });

    const detail = await getBugDetail(db, { actor: f.reporter, scope: "mine", bugId: f.report.id });
    expect(detail).toMatchObject({ unread: true, reporterReadSeq: 61, seenActivitySeq: 62 });
    expect(detail.comments).toHaveLength(50);
    expect(detail.comments.find(comment => comment.id === comments[0].id)).toMatchObject({
      createdAt: AT.toISOString(), body: null, pendingPdf: false, pdf,
    });
    expect(JSON.stringify(detail)).not.toMatch(/"content"|authorUserId/);

    const older = await loadBugThread(db, { actor: f.reporter, scope: "mine", bugId: f.report.id,
      commentsBefore: detail.commentsBefore! });
    expect(older.comments).toHaveLength(11);
    expect(older.commentsBefore).toBeNull();
    expect(older).not.toHaveProperty("seenActivitySeq");
    const ids = [...detail.comments, ...older.comments].map(comment => comment.id);
    expect(ids).toHaveLength(61);
    expect(new Set(ids)).toEqual(new Set(comments.map(comment => comment.id)));
    expect(await db.transaction(tx => markBugRead(tx, { actor: f.reporter, bugId: f.report.id,
      seenActivitySeq: detail.seenActivitySeq, now: new Date() }))).toEqual({ readSeq: 62, activitySeq: 62 });
    expect((await listBugs(db, { actor: f.reporter, scope: "mine" })).items[0].unread).toBe(false);
    expect((await getBugDetail(db, { actor: f.triager, scope: "triage", bugId: f.report.id })).comments)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: comments[0].id, pdf })]));
  });

  it("keeps microsecond PDF activity cursors stable after attachment removal", async () => {
    const f = await fixture();
    const comments = await db.insert(bugReportComments).values(Array.from({ length: 52 }, (_, index) => ({
      bugReportId: f.report.id, authorUserId: f.triager.userId, requestId: randomUUID(), body: `Reply ${index}`,
      createdAt: index === 1 ? sql`${AT.toISOString()}::timestamptz + interval '1.000002 seconds'` : new Date(AT.getTime() + index * 1000),
    }))).returning();
    const [oldest] = await db.insert(bugReportComments).values({ bugReportId: f.report.id, authorUserId: f.triager.userId,
      requestId: randomUUID(), body: "Older than the upload", createdAt: new Date(AT.getTime() + 500) }).returning();
    const content = Buffer.from("%PDF-1.7\n%%EOF");
    const [file] = await db.insert(bugReportFiles).values({ bugReportId: f.report.id, commentId: comments[0].id,
      requestId: randomUUID(), kind: "comment_pdf", uploadedByUserId: f.triager.userId,
      content, mimeType: "application/pdf", byteCount: content.length, fileName: "microsecond.pdf",
      createdAt: sql`${AT.toISOString()}::timestamptz + interval '1.000001 seconds'`,
    }).returning({ id: bugReportFiles.id });

    const detail = await getBugDetail(db, { actor: f.reporter, scope: "mine", bugId: f.report.id });
    expect(detail.comments.map(comment => comment.id)).toEqual(comments.slice(2).map(comment => comment.id));
    const first = await loadBugThread(db, { actor: f.reporter, scope: "mine", bugId: f.report.id,
      commentsBefore: detail.commentsBefore!, limit: 1 });
    expect(first.comments.map(comment => comment.id)).toEqual([comments[1].id]);
    const second = await loadBugThread(db, { actor: f.reporter, scope: "mine", bugId: f.report.id,
      commentsBefore: first.commentsBefore!, limit: 1 });
    expect(second.comments.map(comment => comment.id)).toEqual([comments[0].id]);
    expect(second.comments[0].pdf?.id).toBe(file.id);
    expect(second.commentsBefore).not.toBeNull();

    await db.transaction(tx => removeBugPdf(tx, { actor: f.triager, fileId: file.id, reason: "Synthetic removal",
      now: new Date(), correlationId: "test" }));
    const third = await loadBugThread(db, { actor: f.reporter, scope: "mine", bugId: f.report.id,
      commentsBefore: second.commentsBefore!, limit: 1 });
    expect(third.comments.map(comment => comment.id)).toEqual([oldest.id]);
    expect(third.commentsBefore).toBeNull();
    expect((await getBugDetail(db, { actor: f.reporter, scope: "mine", bugId: f.report.id })).commentsBefore)
      .toBe(detail.commentsBefore);
  });

  it("initially shows newest 50 comments/history chronologically and pages older rows without a watermark", async () => {
    const f = await fixture();
    const times = Array.from({ length: 61 }, (_, index) => new Date(AT.getTime() + index * 1000));
    const comments = await db.insert(bugReportComments).values(times.map((createdAt, index) => ({
      bugReportId: f.report.id, authorUserId: f.triager.userId, requestId: randomUUID(), body: `Synthetic ${index}`, createdAt,
    }))).returning();
    await db.insert(bugReportStatusChanges).values(times.map((createdAt, index) => ({
      bugReportId: f.report.id, changedByUserId: f.triager.userId, fromStatus: index % 2 ? "done" as const : "in_progress" as const,
      toStatus: index % 2 ? "in_progress" as const : "done" as const, createdAt,
    })));
    await db.update(bugReports).set({ status: "done", reporterActivitySeq: 122, reporterReadSeq: 1 }).where(eq(bugReports.id, f.report.id));
    const detail = await getBugDetail(db, { actor: f.reporter, scope: "mine", bugId: f.report.id });
    expect(detail.comments.map((comment) => comment.id)).toEqual(comments.slice(11).map((comment) => comment.id));
    expect(detail.statusChanges).toHaveLength(50);
    expect(detail.statusChanges[49].createdAt).toBe(times[60].toISOString());
    expect(detail).toMatchObject({ seenActivitySeq: 122, unread: true, status: "done" });
    expect(detail.commentsBefore).toEqual(expect.any(String));
    expect(detail.historyBefore).toEqual(expect.any(String));
    const older = await loadBugThread(db, { actor: f.reporter, scope: "mine", bugId: f.report.id,
      commentsBefore: detail.commentsBefore!, historyBefore: detail.historyBefore! });
    expect(older.comments.map((comment) => comment.id)).toEqual(comments.slice(0, 11).map((comment) => comment.id));
    expect(older.statusChanges).toHaveLength(11);
    expect(older.commentsBefore).toBeNull();
    expect(older.historyBefore).toBeNull();
    expect(older).not.toHaveProperty("seenActivitySeq");
    const [after] = await db.select().from(bugReports).where(eq(bugReports.id, f.report.id));
    expect(after).toMatchObject({ reporterActivitySeq: 122, reporterReadSeq: 1, version: 1, updatedAt: AT });
  });

  it("keeps the activity counter and thread in the same snapshot when a reply commits between detail reads", async () => {
    const f = await fixture();
    const original = actors.loadActorByUserId;
    vi.spyOn(actors, "loadActorByUserId").mockImplementationOnce(async (snapshot, userId) => {
      const actor = await original(snapshot, userId); // Establishes the detail transaction's snapshot.
      await db.transaction(async (writer) => {
        await writer.insert(bugReportComments).values({ bugReportId: f.report.id, authorUserId: f.triager.userId,
          requestId: randomUUID(), body: "Racing reply", createdAt: new Date(AT.getTime() + 1000) });
        await writer.update(bugReports).set({ reporterActivitySeq: 1 }).where(eq(bugReports.id, f.report.id));
      });
      return actor;
    });
    const detail = await getBugDetail(db, { actor: f.reporter, scope: "mine", bugId: f.report.id });
    expect(detail.seenActivitySeq).toBe(0);
    expect(detail.comments).toEqual([]);
    expect((await getBugDetail(db, { actor: f.reporter, scope: "mine", bugId: f.report.id })).seenActivitySeq).toBe(1);
  });

  it("returns same-origin attachment metadata and preserves removed tombstones without byte projections", async () => {
    const f = await fixture();
    const bytes = Buffer.from("private image byte sentinel");
    const [image] = await db.insert(bugReportImages).values({ bugReportId: f.report.id, kind: "screenshot", content: bytes,
      mimeType: "image/png", width: 1, height: 1, byteCount: bytes.byteLength, uploadedByUserId: f.reporter.userId,
    }).returning({ id: bugReportImages.id });
    const detail = await getBugDetail(db, { actor: f.reporter, scope: "mine", bugId: f.report.id });
    expect(detail.screenshot).toMatchObject({ id: image.id, url: `/api/bugs/images/${image.id}`, removed: false });
    expect(JSON.stringify(detail)).not.toMatch(/private image byte sentinel|"content"|"userAgent"|base64|data:/);
    await db.update(bugReportImages).set({ content: null, removedByUserId: f.triager.userId, removedAt: AT,
      removedReason: "Synthetic privacy removal" }).where(eq(bugReportImages.id, image.id));
    expect((await getBugDetail(db, { actor: f.reporter, scope: "mine", bugId: f.report.id })).screenshot)
      .toMatchObject({ id: image.id, url: null, removed: true, byteCount: bytes.byteLength });
  });
});
