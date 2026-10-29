import "server-only";
import { and, count, eq, lt } from "drizzle-orm";
import type { BugNavCounts } from "@/src/lib/bugs/types";
import { loadActorByUserId, type Actor } from "@/src/server/auth/actor";
import type { DbOrTx } from "@/src/server/db/client";
import { bugReports } from "@/src/server/db/schema/bugs";
import { AuthorizationError } from "@/src/server/errors";

/** Each aggregate is capability-scoped. Unread counts reports, including terminal ones. */
export async function bugNavCounts(db: DbOrTx, { actor }: { actor: Actor }): Promise<BugNavCounts> {
  if (!actor.permissions.has("bugs.report") && !actor.permissions.has("bugs.triage")) return { bugNew: 0, bugUnread: 0 };
  const current = await loadActorByUserId(db, actor.userId);
  if (!current || (!current.permissions.has("bugs.report") && !current.permissions.has("bugs.triage"))) {
    throw new AuthorizationError("role_missing_permission");
  }
  const [newRows, unreadRows] = await Promise.all([
    current.permissions.has("bugs.triage") ? db.select({ n: count() }).from(bugReports).where(eq(bugReports.status, "new")) : [{ n: 0 }],
    current.permissions.has("bugs.report") ? db.select({ n: count() }).from(bugReports).where(and(
      eq(bugReports.reporterUserId, current.userId), lt(bugReports.reporterReadSeq, bugReports.reporterActivitySeq),
    )) : [{ n: 0 }],
  ]);
  return { bugNew: newRows[0]?.n ?? 0, bugUnread: unreadRows[0]?.n ?? 0 };
}
