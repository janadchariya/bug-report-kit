import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { permissionsFor } from "@/src/lib/permissions";
import { USER_ROLES } from "@/src/lib/roles";
import type { BugStaff } from "@/src/lib/bugs/types";
import { type Actor, loadActorByUserId } from "@/src/server/auth/actor";
import { loadRolePermissionMatrix } from "@/src/server/auth/role-permissions";
import type { DbOrTx } from "@/src/server/db/client";
import { bugReports, type BugReportRow } from "@/src/server/db/schema/bugs";
import { users } from "@/src/server/db/schema/users";
import { DomainRuleError } from "@/src/server/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function canReadBug(actor: Pick<Actor, "userId" | "permissions">, reporterUserId: string): boolean {
  return actor.permissions.has("bugs.triage") || (actor.permissions.has("bugs.report") && actor.userId === reporterUserId);
}

/** Service boundaries reload activity and effective grants, including for stale action actors. */
export async function requireBugActor(db: DbOrTx, actor: Actor): Promise<Actor> {
  if (!actor?.userId || !UUID.test(actor.userId)) throw new DomainRuleError("bug_not_visible");
  const current = await loadActorByUserId(db, actor.userId);
  if (!current || (!current.permissions.has("bugs.report") && !current.permissions.has("bugs.triage"))) {
    throw new DomainRuleError("bug_not_visible");
  }
  return current;
}

export async function requireVisibleBug(
  db: DbOrTx,
  input: { actor: Actor; bugId: string; forUpdate?: boolean },
): Promise<BugReportRow> {
  const actor = await requireBugActor(db, input.actor);
  if (!UUID.test(input.bugId)) throw new DomainRuleError("bug_not_visible");
  const query = db.select().from(bugReports).where(and(
    eq(bugReports.id, input.bugId),
    actor.permissions.has("bugs.triage") ? undefined : eq(bugReports.reporterUserId, actor.userId),
  )).limit(1);
  const [report] = await (input.forUpdate ? query.for("update") : query);
  const current = input.forUpdate ? await requireBugActor(db, input.actor) : actor;
  if (!report || !canReadBug(current, report.reporterUserId)) throw new DomainRuleError("bug_not_visible");
  return report;
}

/** Staff labels only: assignment eligibility never discloses an email directory. */
export async function listActiveBugTriagers(db: DbOrTx): Promise<BugStaff[]> {
  const matrix = await loadRolePermissionMatrix(db);
  const candidates = await db.select({ id: users.id, displayName: users.displayName, nickname: users.nickname, roles: users.roles })
    .from(users).where(eq(users.status, "active")).orderBy(asc(users.displayName), asc(users.id));
  return candidates.filter((user) => permissionsFor(new Set(USER_ROLES.filter((role) => user.roles.includes(role))), matrix).has("bugs.triage"))
    .map((user) => ({ id: user.id, displayName: user.displayName, nickname: user.nickname }));
}
