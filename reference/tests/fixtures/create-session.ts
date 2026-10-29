import { eq } from 'drizzle-orm';
import { assertLocalDatabaseUrl } from '@/scripts/db-reset';
import { createDatabaseSession } from '@/src/server/auth/sessions';
import { closeDb, db } from '@/src/server/db/client';
import { users } from '@/src/server/db/schema/users';
async function main() {
  assertLocalDatabaseUrl(process.env.DATABASE_URL ?? '', process.env.APP_ENVIRONMENT);
  const [email, timestamp] = process.argv.slice(2);
  if (!email?.endsWith('@example.test')) throw new Error('synthetic_test_email_required');
  const [user] = await db.select({ id:users.id }).from(users).where(eq(users.email,email)).limit(1);
  if (!user) throw new Error('test_user_not_found');
  const now = timestamp ? new Date(timestamp) : new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('invalid_test_time');
  const { sessionToken } = await createDatabaseSession(user.id,now);
  process.stdout.write(sessionToken);
}
main().finally(() => closeDb()).catch(() => { process.stderr.write('test_session_failed\n');process.exitCode=1; });
