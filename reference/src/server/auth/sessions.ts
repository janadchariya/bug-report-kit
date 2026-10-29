import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/src/server/db/client';
import { authSessions, users } from '@/src/server/db/schema/users';
import { latestGrantsSql } from './role-permissions';
/** Feed this cookie only from the host's verified sign-in flow; never accept a user ID as a session. */
export async function readActiveSession(token: string, now: Date) {
  if (!token || token.length < 32) return null;
  const [row] = await db.select({ sessionId: authSessions.id, userId: users.id, email: users.email, displayName: users.displayName,
    nickname: users.nickname, roles: users.roles, loginMethod: users.loginMethod, grants: latestGrantsSql }).from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId)).where(and(eq(authSessions.sessionTokenHash, createHash('sha256').update(token).digest('hex')),
      isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now), gt(authSessions.absoluteExpiresAt, now), eq(users.status, 'active'))).limit(1);
  return row ? { ...row, loginMethod: row.loginMethod as 'workspace' | 'personal_google' } : null;
}

/** Host sign-in may call this only after its own identity verification. */
export async function createDatabaseSession(userId: string, now: Date): Promise<{ sessionToken: string }> {
  const sessionToken = randomBytes(32).toString('base64url');
  await db.insert(authSessions).values({ userId, sessionTokenHash: createHash('sha256').update(sessionToken).digest('hex'),
    expiresAt: new Date(now.getTime() + 24*60*60*1000), absoluteExpiresAt: new Date(now.getTime() + 7*24*60*60*1000), lastTouchedAt: now });
  return { sessionToken };
}
