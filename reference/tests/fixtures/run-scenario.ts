import { assertLocalDatabaseUrl } from '@/scripts/db-reset';
import { closeDb } from '@/src/server/db/client';
import { runR19Bugs } from './r19-bugs';
async function main() {
  assertLocalDatabaseUrl(process.env.DATABASE_URL ?? '',process.env.APP_ENVIRONMENT);
  const [name,options] = process.argv.slice(2);
  if (name !== 'r19-bugs') throw new Error('unsupported_scenario');
  process.stdout.write(`${JSON.stringify(await runR19Bugs(JSON.parse(options ?? '{}')))}\n`);
}
main().finally(() => closeDb()).catch(() => {process.stderr.write('test_scenario_failed\n');process.exitCode=1;});
