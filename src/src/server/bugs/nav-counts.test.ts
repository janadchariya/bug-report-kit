import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "@/src/server/db/client";
import { bugReports } from "@/src/server/db/schema/bugs";
import { AuthorizationError } from "@/src/server/errors";
import { buildTestActor } from "@/tests/fixtures/actor";
import { createUser } from "@/tests/fixtures/factories";
import { setRolePermissions } from "@/tests/fixtures/role-permissions";
import { truncateAll } from "@/tests/setup/truncate";
import { bugNavCounts } from "./nav-counts";

beforeEach(truncateAll);
afterEach(() => vi.restoreAllMocks());
async function report(reporterUserId: string, status: "new" | "done" | "cancelled" = "new", unread = false) {
  const [row] = await db.insert(bugReports).values({ reporterUserId, requestId: randomUUID(), summary: "Synthetic bug",
    pagePath: "/today", viewportWidth: 800, viewportHeight: 600, userAgent: "synthetic",
    status, reporterActivitySeq: unread ? 2 : 0, reporterReadSeq: unread ? 1 : 0 }).returning();
  return row;
}

it("counts exactly new reports for triagers, and own unseen reports including terminal ones", async () => {
  const owner = await buildTestActor((await createUser({ roles: ["external_referrer"] })).id);
  const triager = await buildTestActor((await createUser({ roles: ["md"] })).id);
  expect(await bugNavCounts(db, { actor: triager })).toEqual({ bugNew: 0, bugUnread: 0 });
  const row = await report(owner.userId, "new", true);
  await report(owner.userId, "done", true);
  await report(owner.userId, "cancelled", true);
  await report(triager.userId, "new", true);
  expect(await bugNavCounts(db, { actor: owner })).toEqual({ bugNew: 0, bugUnread: 3 });
  expect(await bugNavCounts(db, { actor: triager })).toEqual({ bugNew: 2, bugUnread: 1 });
  await db.update(bugReports).set({ status: "in_progress" }).where(eq(bugReports.id, row.id));
  expect(await bugNavCounts(db, { actor: triager })).toEqual({ bugNew: 1, bugUnread: 1 });
});

it("does not query inaccessible bug buckets, including a triage-only user's own unseen activity", async () => {
  await setRolePermissions({ finance: { "bugs.triage": true, "bugs.report": false } });
  const triager = await buildTestActor((await createUser({ roles: ["finance"] })).id);
  await report(triager.userId, "new", true);
  const select = vi.spyOn(db, "select");
  expect(await bugNavCounts(db, { actor: triager })).toEqual({ bugNew: 1, bugUnread: 0 });
  const aggregates = select.mock.calls.filter(call => call[0] && "n" in call[0]);
  expect(aggregates).toHaveLength(1);
  select.mockClear();
  expect(await bugNavCounts(db, { actor: { ...triager, permissions: new Set() } })).toEqual({ bugNew: 0, bugUnread: 0 });
  expect(select).not.toHaveBeenCalled();
});

it("reloads effective permissions and refuses a revoked stale actor", async () => {
  const actor = await buildTestActor((await createUser({ roles: ["finance"] })).id);
  await report(actor.userId, "new", true);
  await setRolePermissions({ finance: { "bugs.report": false, "bugs.triage": false } });
  await expect(bugNavCounts(db, { actor })).rejects.toBeInstanceOf(AuthorizationError);
});
