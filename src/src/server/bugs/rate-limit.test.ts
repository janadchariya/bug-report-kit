import { randomUUID } from "node:crypto";
import { count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, type Db, type Tx } from "@/src/server/db/client";
import { createSqlClient } from "@/src/server/db/connection";
import * as schema from "@/src/server/db/schema";
import { bugReportComments, bugReports } from "@/src/server/db/schema/bugs";
import { createUser } from "@/tests/fixtures/factories";
import { truncateAll } from "@/tests/setup/truncate";
import { checkBugQuota, lockBugQuota } from "./rate-limit";

beforeEach(truncateAll);
const connections: ReturnType<typeof createSqlClient>[] = [];
afterEach(async () => { await Promise.all(connections.splice(0).map((connection) => connection.end({ timeout: 5 }))); });

function connection(): Db {
  const client = createSqlClient(process.env.DATABASE_URL!, 1);
  connections.push(client);
  return drizzle(client, { schema });
}

async function insertReport(tx: Tx, userId: string, createdAt: Date, requestId = randomUUID()) {
  const [report] = await tx.insert(bugReports).values({ reporterUserId: userId, requestId, summary: "Synthetic quota",
    pagePath: "/bugs/mine", pageQuery: "", viewportWidth: 800, viewportHeight: 600, userAgent: "Synthetic/1", createdAt,
  }).returning();
  return report;
}

describe("transaction-scoped rolling bug quotas", () => {
  it("serializes independent report writers at five, keeps cancellation counted and isolates actors", async () => {
    const reporter = await createUser();
    const other = await createUser();
    const writer = (database: Db, userId = reporter.id) => database.transaction(async (tx) => {
      const now = await lockBugQuota(tx, userId, "report");
      await checkBugQuota(tx, userId, "report", now);
      return insertReport(tx, userId, now);
    });
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => writer(connection())));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(5);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "bug_rate_limited" } });
    await db.update(bugReports).set({ status: "cancelled" }).where(eq(bugReports.reporterUserId, reporter.id));
    await expect(writer(connection())).rejects.toMatchObject({ code: "bug_rate_limited" });
    await expect(writer(connection(), other.id)).resolves.toMatchObject({ reporterUserId: other.id });
    expect((await db.select({ value: count() }).from(bugReports).where(eq(bugReports.reporterUserId, reporter.id)))[0].value).toBe(5);
  });

  it("serializes independent comment writers at thirty", async () => {
    const author = await createUser();
    const report = await db.transaction((tx) => insertReport(tx, author.id, new Date()));
    const writers = [connection(), connection()];
    const results = await Promise.allSettled(Array.from({ length: 31 }, (_, index) => writers[index % 2].transaction(async (tx) => {
      const now = await lockBugQuota(tx, author.id, "comment");
      await checkBugQuota(tx, author.id, "comment", now);
      await tx.insert(bugReportComments).values({ bugReportId: report.id, authorUserId: author.id,
        requestId: randomUUID(), body: "Synthetic quota", createdAt: now });
    })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(30);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "bug_rate_limited" } });
  });

  it("applies the comment quota per author across reports without consuming another author's capacity", async () => {
    const author = await createUser(), other = await createUser();
    const at = new Date("2026-10-27T03:00:00.000Z");
    await db.transaction(async (tx) => {
      const first = await insertReport(tx, author.id, at);
      const second = await insertReport(tx, author.id, at);
      await lockBugQuota(tx, author.id, "comment");
      await tx.insert(bugReportComments).values(Array.from({ length: 30 }, (_, index) => ({
        bugReportId: index % 2 === 0 ? first.id : second.id, authorUserId: author.id,
        requestId: randomUUID(), body: "Synthetic per-author quota", createdAt: at,
      })));
      await expect(checkBugQuota(tx, author.id, "comment", at)).rejects.toMatchObject({ code: "bug_rate_limited" });
      await lockBugQuota(tx, other.id, "comment");
      await expect(checkBugQuota(tx, other.id, "comment", at)).resolves.toBeUndefined();
      await tx.insert(bugReportComments).values({ bugReportId: first.id, authorUserId: other.id,
        requestId: randomUUID(), body: "Synthetic independent author", createdAt: at });
      expect((await tx.select({ value: count() }).from(bugReportComments)
        .where(eq(bugReportComments.authorUserId, other.id)))[0].value).toBe(1);
    });
  });

  it("expires comments at the exact ten-minute boundary and excludes future comments", async () => {
    const author = await createUser();
    const at = new Date("2026-10-27T03:00:00.000Z");
    await db.transaction(async (tx) => {
      const report = await insertReport(tx, author.id, at);
      await lockBugQuota(tx, author.id, "comment");
      for (const createdAt of [new Date(at.getTime() - 600_000), new Date(at.getTime() + 1)]) {
        await tx.insert(bugReportComments).values(Array.from({ length: 30 }, () => ({
          bugReportId: report.id, authorUserId: author.id, requestId: randomUUID(),
          body: "Synthetic outside quota window", createdAt,
        })));
      }
      await expect(checkBugQuota(tx, author.id, "comment", at)).resolves.toBeUndefined();
      await tx.insert(bugReportComments).values(Array.from({ length: 30 }, () => ({
        bugReportId: report.id, authorUserId: author.id, requestId: randomUUID(),
        body: "Synthetic current quota window", createdAt: at,
      })));
      await expect(checkBugQuota(tx, author.id, "comment", at)).rejects.toMatchObject({ code: "bug_rate_limited" });
      await expect(checkBugQuota(tx, author.id, "comment", new Date(at.getTime() + 600_001)))
        .resolves.toBeUndefined();
    });
  });

  it("uses the exact open-lower, closed-upper window without sleeping ten minutes", async () => {
    const reporter = await createUser();
    const now = new Date("2026-10-27T03:00:00.000Z");
    await db.transaction(async (tx) => {
      for (let index = 0; index < 5; index++) await insertReport(tx, reporter.id, new Date(now.getTime() - 600_000));
      await insertReport(tx, reporter.id, new Date(now.getTime() + 1)); // Future rows never consume the window.
      await expect(checkBugQuota(tx, reporter.id, "report", now)).resolves.toBeUndefined();
      for (let index = 0; index < 5; index++) await insertReport(tx, reporter.id, now);
      await expect(checkBugQuota(tx, reporter.id, "report", now)).rejects.toMatchObject({ code: "bug_rate_limited" });
    });
  });

  it("counts microsecond-precision inserts against a newly captured database clock by default", async () => {
    const reporter = await createUser();
    await db.transaction(async (tx) => {
      await lockBugQuota(tx, reporter.id, "report");
      for (let index = 0; index < 5; index++) await tx.insert(bugReports).values({
        reporterUserId: reporter.id, requestId: randomUUID(), summary: "Synthetic precise quota", pagePath: "/bugs/mine",
        pageQuery: "", viewportWidth: 800, viewportHeight: 600, userAgent: "Synthetic/1", createdAt: sql`clock_timestamp()`,
      });
      await expect(checkBugQuota(tx, reporter.id, "report")).rejects.toMatchObject({ code: "bug_rate_limited" });
    });
  });

  it("captures the database wall clock only after obtaining its advisory lock", async () => {
    const reporter = await createUser();
    const first = connection(), second = connection();
    let release!: () => void;
    let locked!: () => void;
    let secondStarted!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { locked = resolve; });
    const secondReady = new Promise<void>((resolve) => { secondStarted = resolve; });
    let firstTime!: Date;
    const firstWrite = first.transaction(async (tx) => {
      firstTime = await lockBugQuota(tx, reporter.id, "report");
      locked();
      await held;
      await insertReport(tx, reporter.id, firstTime);
    });
    await ready;
    const secondWrite = second.transaction(async (tx) => {
      await tx.execute(sql`select transaction_timestamp()`);
      secondStarted();
      const after = await lockBugQuota(tx, reporter.id, "report");
      await checkBugQuota(tx, reporter.id, "report", after);
      return after;
    });
    await secondReady;
    // A short DB wait creates a measurable boundary; no ten-minute quota sleeps.
    await db.execute(sql`select pg_sleep(0.02)`);
    const [boundary] = await db.execute<{ at: Date | string }>(sql`select clock_timestamp() as at`);
    release();
    await firstWrite;
    const secondTime = await secondWrite;
    expect(secondTime.getTime()).toBeGreaterThanOrEqual(firstTime.getTime());
    expect(secondTime.getTime()).toBeGreaterThanOrEqual(new Date(boundary.at).getTime());
    expect(Math.abs(secondTime.getTime() - Date.now())).toBeLessThan(10_000);
  });
});
