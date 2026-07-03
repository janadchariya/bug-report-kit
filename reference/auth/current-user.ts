/**
 * Resolve the currently logged-in user via NextAuth session.
 *
 * Supports admin **impersonation**: when the real session user is ADMIN and
 * the `impersonate-user-id` cookie is set, `getCurrentUser()` returns the
 * impersonated user. Use `getRealCurrentUser()` to get the actual logged-in
 * actor (e.g. for audit logging).
 */
import { cookies } from "next/headers";

import { auth } from "@/lib/auth/auth";
import { canTestImpersonate } from "@/lib/auth/test-impersonation";
import { prisma } from "@/lib/db/prisma";
import { mapUser } from "@/lib/store/mappers";
import type { User, UserRole } from "@/lib/store/types";

export const IMPERSONATE_COOKIE = "impersonate-user-id";

/** Always returns the real logged-in user (ignores impersonation cookie). */
export async function getRealCurrentUser(): Promise<User> {
  const session = await auth();
  if (!session?.user?.email) {
    throw new Error("Not authenticated");
  }
  const row = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
  });
  if (!row) {
    throw new Error("User record not found");
  }
  return mapUser(row);
}

export async function getCurrentUserId(): Promise<string> {
  const user = await getCurrentUser();
  return user.id;
}

/**
 * Returns the effective current user.
 *
 * If the real session is ADMIN and the impersonation cookie points at an
 * active user, returns the impersonated user. Otherwise returns the real
 * user. All app code (dashboards, role gates, data fetches) reads from here
 * so impersonation transparently swaps the perspective.
 */
export async function getCurrentUser(): Promise<User> {
  const real = await getRealCurrentUser();

  const jar = await cookies();
  const targetId = jar.get(IMPERSONATE_COOKIE)?.value;
  if (!targetId || targetId === real.id) return real;

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target || !target.isActive) return real;

  const mapped = mapUser(target);
  // ADMIN may impersonate anyone; testers only roles on the UAT allowlist.
  if (real.role !== "ADMIN" && !canTestImpersonate(real.email, mapped.role)) {
    return real;
  }
  return mapped;
}

/** True when the real user is currently impersonating someone else (ADMIN, or a UAT-allowlisted tester). */
export async function isImpersonating(): Promise<{
  active: boolean;
  realUser?: User;
  impersonatedUser?: User;
}> {
  const real = await getRealCurrentUser().catch(() => null);
  if (!real) return { active: false };
  const jar = await cookies();
  const targetId = jar.get(IMPERSONATE_COOKIE)?.value;
  if (!targetId || targetId === real.id) return { active: false, realUser: real };
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) return { active: false, realUser: real };
  const mapped = mapUser(target);
  if (real.role !== "ADMIN" && !canTestImpersonate(real.email, mapped.role)) {
    return { active: false, realUser: real };
  }
  return {
    active: true,
    realUser: real,
    impersonatedUser: mapped,
  };
}

export async function requireRole(role: UserRole): Promise<User> {
  const user = await getCurrentUser();
  if (user.role !== role && user.role !== "ADMIN") {
    throw new Error(`Forbidden: requires ${role}, current is ${user.role}`);
  }
  return user;
}

export async function requireAnyRole(roles: UserRole[]): Promise<User> {
  const user = await getCurrentUser();
  if (!roles.includes(user.role) && user.role !== "ADMIN") {
    throw new Error(
      `Forbidden: requires one of ${roles.join(", ")}, current is ${user.role}`,
    );
  }
  return user;
}
