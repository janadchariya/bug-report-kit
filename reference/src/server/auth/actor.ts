import "server-only";
import { and, eq, getTableColumns } from "drizzle-orm";
import { permissionsFor, resolveMatrix, type Permission } from "@/src/lib/permissions";
import { type Role, USER_ROLES } from "@/src/lib/roles";
import type { DbOrTx } from "@/src/server/db/client";
import { users } from "@/src/server/db/schema/users";
import { latestGrantsSql } from "./role-permissions";
import { readActiveSession } from "./sessions";

export type { Role } from "@/src/lib/roles";

export interface Actor {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly nickname: string | null;
  readonly roles: ReadonlySet<Role>;
  readonly permissions: ReadonlySet<Permission>;
  readonly loginMethod: "workspace" | "personal_google";
  readonly sessionId: string | null;
}

const KNOWN_ROLES: ReadonlySet<string> = new Set(USER_ROLES);

export function isRole(value: string): value is Role {
  return KNOWN_ROLES.has(value);
}

const roleSet = (roles: readonly string[]): ReadonlySet<Role> => new Set(roles.filter(isRole));

export async function loadActorFromSessionToken(sessionToken: string, now: Date): Promise<Actor | null> {
  const session = await readActiveSession(sessionToken, now);
  if (!session) return null;
  const roles = roleSet(session.roles);
  return {
    userId: session.userId,
    email: session.email,
    displayName: session.displayName,
    nickname: session.nickname,
    roles,
    permissions: permissionsFor(roles, resolveMatrix(session.grants)),
    loginMethod: session.loginMethod,
    sessionId: session.sessionId,
  };
}

export async function loadActorByUserId(db: DbOrTx, userId: string): Promise<Actor | null> {
  const [row] = await db
    .select({ ...getTableColumns(users), grants: latestGrantsSql })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.status, "active")))
    .limit(1);
  if (!row) return null;
  const roles = roleSet(row.roles);
  return {
    userId: row.id,
    email: row.email,
    displayName: row.displayName,
    nickname: row.nickname,
    roles,
    permissions: permissionsFor(roles, resolveMatrix(row.grants)),
    loginMethod: row.loginMethod as Actor["loginMethod"],
    sessionId: null,
  };
}
