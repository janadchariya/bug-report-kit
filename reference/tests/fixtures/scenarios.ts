import { execFileSync } from 'node:child_process';
import { E2E_ENV } from '../e2e/env';
export async function seedScenario(name: 'r19-bugs', options: { reason?: string; leadId?: string; fixtureState?: string } = {}): Promise<{ leadId:string;companyLabel:string;[key:string]:string }> {
  const output = execFileSync('npx',['tsx','tests/fixtures/run-scenario.ts',name,JSON.stringify(options)], {
    env:{ ...process.env,...E2E_ENV,NODE_OPTIONS:'--conditions=react-server' },encoding:'utf8',
  });
  return JSON.parse(output.trim().split('\n').at(-1) ?? '{}') as {leadId:string;companyLabel:string;[key:string]:string};
}
