/** Run with: npx tsx scripts/migrate-bugs.ts. Review DB target before running. */
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
const files = ['db/0000_host_dependencies.sql','db/migrations/0001_bug_reports.sql','db/migrations/0002_bug_chat.sql','db/migrations/0003_bug_pdf.sql'];
async function main() {
  const target = process.env.DATABASE_URL; if (!target) throw new Error('DATABASE_URL_required');
  const client = postgres(target,{max:1,prepare:false});
  try {
    await client.begin(async tx => {
      await tx`create table if not exists public.bug_kit_migrations (name text primary key, applied_at timestamptz not null default now())`;
      await tx`select pg_advisory_xact_lock(hashtext('bug-kit-migrations'))`;
      for (const file of files) {
        if ((await tx`select name from public.bug_kit_migrations where name = ${file}`).length) continue;
        const content = await readFile(file,'utf8');
        for (const part of content.split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean)) await tx.unsafe(part);
        await tx`insert into public.bug_kit_migrations (name) values (${file})`;
      }
    });
  } finally { await client.end({timeout:5}); }
}
main().catch(() => {process.stderr.write('Bug migration failed; transaction rolled back. Inspect your migration runner for the SQLSTATE, without logging credentials.\n');process.exitCode=1;});
