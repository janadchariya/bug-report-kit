import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as actors from "@/src/server/auth/actor";
import { db } from "@/src/server/db/client";
import { bugReports } from "@/src/server/db/schema/bugs";
import { rolePermissionVersions } from "@/src/server/db/schema/role-permissions";
import { users } from "@/src/server/db/schema/users";
import { buildTestActor } from "@/tests/fixtures/actor";
import { createUser } from "@/tests/fixtures/factories";
import { setRolePermissions } from "@/tests/fixtures/role-permissions";
import { truncateAll } from "@/tests/setup/truncate";
import { canReadBug, listActiveBugTriagers, requireBugActor, requireVisibleBug } from "./access";

beforeEach(truncateAll);
afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const reporter = await buildTestActor((await createUser({ roles: ["external_referrer"] })).id);
  const stranger = await buildTestActor((await createUser({ roles: ["seller_assist"] })).id);
  const triager = await buildTestActor((await createUser({ roles: ["md"] })).id);
  const [report] = await db.insert(bugReports).values({
    reporterUserId: reporter.userId, requestId: randomUUID(), summary: "Synthetic bug", pagePath: "/bugs/mine",
    pageQuery: "", viewportWidth: 800, viewportHeight: 600, userAgent: "Synthetic/1",
  }).returning();
  return { reporter, stranger, triager, report };
}

describe("effective bug visibility", () => {
  it("permits an own reporter without Lead permissions and a triager on any report", async () => {
    const { reporter, triager, report } = await fixture();
    expect(reporter.permissions.has("lead.work_own")).toBe(false);
    expect(canReadBug(reporter, reporter.userId)).toBe(true);
    expect(canReadBug(triager, reporter.userId)).toBe(true);
    await expect(requireVisibleBug(db, { actor: reporter, bugId: report.id })).resolves.toMatchObject({ id: report.id });
    await expect(requireVisibleBug(db, { actor: triager, bugId: report.id })).resolves.toMatchObject({ id: report.id });
  });

  it("refuses foreign and missing IDs with the same safe result", async () => {
    const { stranger, report } = await fixture();
    await expect(requireVisibleBug(db, { actor: stranger, bugId: report.id })).rejects.toMatchObject({ code: "bug_not_visible" });
    await expect(requireVisibleBug(db, { actor: stranger, bugId: randomUUID() })).rejects.toMatchObject({ code: "bug_not_visible" });
    await expect(requireVisibleBug(db, { actor: stranger, bugId: "invalid-id" })).rejects.toMatchObject({ code: "bug_not_visible" });
  });

  it("reloads active status and grants instead of trusting a stale actor", async () => {
    const { reporter, triager, report } = await fixture();
    await setRolePermissions({ external_referrer: { "bugs.report": false }, md: { "bugs.triage": false } });
    await expect(requireVisibleBug(db, { actor: reporter, bugId: report.id })).rejects.toMatchObject({ code: "bug_not_visible" });
    await expect(requireVisibleBug(db, { actor: triager, bugId: report.id })).rejects.toMatchObject({ code: "bug_not_visible" });
    await db.update(users).set({ status: "inactive" }).where(eq(users.id, reporter.userId));
    await expect(requireBugActor(db, reporter)).rejects.toMatchObject({ code: "bug_not_visible" });
    await expect(requireBugActor(db, { ...reporter, userId: randomUUID() })).rejects.toMatchObject({ code: "bug_not_visible" });
    await expect(requireBugActor(db, null as unknown as typeof reporter)).rejects.toMatchObject({ code: "bug_not_visible" });
  });

  it("honors delegated triage and triage with report permission explicitly revoked", async () => {
    const { stranger, triager, report } = await fixture();
    await setRolePermissions({ seller_assist: { "bugs.triage": true, "bugs.report": false }, md: { "bugs.report": false } });
    await expect(requireVisibleBug(db, { actor: stranger, bugId: report.id })).resolves.toMatchObject({ id: report.id });
    await expect(requireVisibleBug(db, { actor: triager, bugId: report.id })).resolves.toMatchObject({ id: report.id });
    const eligible = await listActiveBugTriagers(db);
    expect(eligible.map((user) => user.id).sort()).toEqual([stranger.userId, triager.userId].sort());
    expect(JSON.stringify(eligible)).not.toContain("@example");
    await db.update(users).set({ status: "inactive" }).where(eq(users.id, stranger.userId));
    expect((await listActiveBugTriagers(db)).map((user) => user.id)).toEqual([triager.userId]);
  });

  it("rechecks grants after a report lock wait instead of accepting pre-wait authority", async () => {
    const f = await fixture();
    let held!: () => void, actorRead!: () => void;
    const lockReady = new Promise<void>((resolve) => { held = resolve; });
    const actorReady = new Promise<void>((resolve) => { actorRead = resolve; });
    let readerPid = 0;
    const original = actors.loadActorByUserId;
    vi.spyOn(actors, "loadActorByUserId").mockImplementationOnce(async (database, userId) => {
      const actor = await original(database, userId);
      actorRead();
      return actor;
    });
    const holder = db.transaction(async (tx) => {
      await tx.select({ id: bugReports.id }).from(bugReports).where(eq(bugReports.id, f.report.id)).for("update");
      held();
      await actorReady;
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        const [row] = await tx.execute<{ waiting: boolean }>(sql`select cardinality(pg_blocking_pids(${readerPid})) > 0 as waiting`);
        waiting = row.waiting;
      }
      expect(waiting).toBe(true);
      await tx.insert(rolePermissionVersions).values({ version: 1, grants: { external_referrer: { "bugs.report": false } },
        reason: "Synthetic revocation", createdAt: new Date() });
    });
    await lockReady;
    const reader = db.transaction(async (tx) => {
      const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      readerPid = row.pid;
      return requireVisibleBug(tx, { actor: f.reporter, bugId: f.report.id, forUpdate: true });
    });
    const result = await Promise.allSettled([holder, reader]);
    expect(result[0].status).toBe("fulfilled");
    expect(result[1]).toMatchObject({ status: "rejected", reason: { code: "bug_not_visible" } });
  });
});
