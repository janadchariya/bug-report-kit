import "server-only";
import { sql } from "drizzle-orm";
import { BUG_LIMITS } from "@/src/domain/bugs";
import type { Tx } from "@/src/server/db/client";
import { bugReportComments, bugReportFiles, bugReportImages, bugReports } from "@/src/server/db/schema/bugs";
import { DomainRuleError } from "@/src/server/errors";

export type BugQuotaKind = "report" | "comment" | "pdf";

/** Keep this transaction open through retry lookup, quota check and insertion. */
export async function lockBugQuota(tx: Tx, actorId: string, kind: BugQuotaKind): Promise<Date> {
  // Reports and comments share image capacity, so their writers must share a lock.
  // Retain kind in the call contract to identify the count quota each caller uses.
  void kind;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sales:bugs:quota:${actorId}`}, 0))`);
  // clock_timestamp() is evaluated after the lock, unlike the transaction's now().
  const [row] = await tx.execute<{ now: Date | string }>(sql`select clock_timestamp() as now`);
  return new Date(row.now);
}

/** Call only after lockBugQuota, and after an idempotent retry lookup. */
export async function checkBugQuota(tx: Tx, actorId: string, kind: Exclude<BugQuotaKind, 'pdf'>, now?: Date): Promise<void> {
  const table = kind === "report" ? bugReports : bugReportComments;
  const actorColumn = kind === "report" ? bugReports.reporterUserId : bugReportComments.authorUserId;
  const createdAt = kind === "report" ? bugReports.createdAt : bugReportComments.createdAt;
  // Materialize one precise wall clock after all caller locks. Converting it to a JS
  // Date would truncate microseconds and could exclude a just-committed insertion.
  const clock = now === undefined ? sql`clock_timestamp()` : sql`${now.toISOString()}::timestamptz`;
  const [row] = await tx.execute<{ total: number }>(sql`
    with quota_clock as materialized (select ${clock} as at)
    select count(*)::integer as total from ${table}, quota_clock
    where ${actorColumn} = ${actorId}
      and ${createdAt} > quota_clock.at - (${BUG_LIMITS.windowMs} * interval '1 millisecond')
      and ${createdAt} <= quota_clock.at
  `);
  const limit = kind === "report" ? BUG_LIMITS.reportsPerWindow : BUG_LIMITS.commentsPerWindow;
  if (row.total >= limit) throw new DomainRuleError("bug_rate_limited");
}

/** After retry lookup, under the actor lock held through the image insertion. */
export async function checkBugImageQuota(tx: Tx, actorId: string, incomingBytes: number, now?: Date): Promise<void> {
  if (incomingBytes === 0) return;
  const clock = now === undefined ? sql`clock_timestamp()` : sql`${now.toISOString()}::timestamptz`;
  const [row] = await tx.execute<{ total: number | string }>(sql`
    with quota_clock as materialized (select ${clock} as at)
    select coalesce(sum(uploads.byte_count), 0)::bigint as total
    from (
      select ${bugReportImages.byteCount} as byte_count, ${bugReportImages.uploadedByUserId} as uploader, ${bugReportImages.createdAt} as created_at from ${bugReportImages}
      union all
      select ${bugReportFiles.byteCount}, ${bugReportFiles.uploadedByUserId}, ${bugReportFiles.createdAt} from ${bugReportFiles}
    ) uploads, quota_clock
    where uploads.uploader = ${actorId}
      and uploads.created_at > quota_clock.at - (${BUG_LIMITS.imageWindowMs} * interval '1 millisecond')
      and uploads.created_at <= quota_clock.at
  `);
  // Removed bytes remain in Postgres's physical storage until maintenance. The
  // retained metadata consumes quota too; removing an image cannot reset it.
  if (Number(row.total) + incomingBytes > BUG_LIMITS.imageBytesPerWindow) {
    throw new DomainRuleError("bug_image_quota_exceeded");
  }
}
