import { execFileSync } from 'node:child_process';
import type { Page } from '@playwright/test';
import { SESSION_COOKIE_NAME } from '@/src/server/auth/session-cookie';
import { E2E_ENV } from '../e2e/env';
/** Test-runner-only DB session minting; never expose this as an HTTP route. */
export async function signInAs(page: Page, email: string, issuedAt?: Date): Promise<void> {
  const value = execFileSync('npx', ['tsx','tests/fixtures/create-session.ts',email,...(issuedAt ? [issuedAt.toISOString()] : [])], {
    env: { ...process.env, ...E2E_ENV, NODE_OPTIONS:'--conditions=react-server' }, encoding:'utf8',
  }).trim();
  const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
  await page.context().addCookies([{ name:SESSION_COOKIE_NAME,value,url:base,httpOnly:true,sameSite:'Lax',secure:new URL(base).protocol === 'https:' }]);
}
