import { sql } from 'drizzle-orm';
import { assertLocalDatabaseUrl } from '@/scripts/db-reset';
import { db } from '@/src/server/db/client';
export async function truncateAll(): Promise<void> {
  assertLocalDatabaseUrl(process.env.DATABASE_URL ?? '', process.env.APP_ENVIRONMENT);
  await db.transaction(async tx => {
    // Source SQL test-only trigger escape; ordinary deletes remain forbidden.
    await tx.execute(sql`select pg_catalog.set_config('sales_crm.test_truncate', 'on', true)`);
    const names = ['bug_report_files','bug_report_images','bug_report_comments','bug_report_status_changes','bug_reports','chat_action_tokens','chat_messages','chat_webhooks','chat_spaces','outbox_jobs','calendar_events','calendar_feeds','field_changes','events','role_permission_versions','auth_sessions','leads','contacts','accounts','users'];
    await tx.execute(sql`truncate table ${sql.join(names.map(name => sql.identifier(name)), sql`, `)} restart identity cascade`);
  });
}
