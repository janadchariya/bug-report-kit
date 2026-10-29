import 'server-only';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { z } from 'zod';
import { AuthenticationError, AuthorizationError, DomainRuleError, StaleStateError, ValidationError } from '@/src/server/errors';
import { logger } from '@/src/server/logging/logger';
import { safeErrorClass } from '@/src/server/logging/redact';
import { type Actor, loadActorFromSessionToken } from './actor';
import { SESSION_COOKIE_NAME } from './session-cookie';
import { assertCan, canAny, type Permission } from './permissions';
export type ActionResult<T> = { readonly ok: true; readonly data: T } | {
  readonly ok: false; readonly code: 'unauthenticated' | 'forbidden' | 'invalid_input' | 'rule' | 'stale_state' | 'internal_error';
  readonly correlationId: string; readonly reasonCode: string | null; readonly currentVersion?: number;
};
export async function requireActor(): Promise<Actor> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) throw new AuthenticationError('missing_session_cookie');
  const actor = await loadActorFromSessionToken(token, new Date());
  if (!actor) throw new AuthenticationError('invalid_or_expired_session');
  return actor;
}
export async function requireActorOrRedirect(permission?: Permission | readonly Permission[]): Promise<Actor> {
  let actor: Actor;
  try { actor = await requireActor(); } catch (error) { if (error instanceof AuthenticationError) redirect('/signin?callbackUrl=%2Fbugs%2Fmine'); throw error; }
  if (permission && !canAny(actor, permission)) notFound();
  return actor;
}
export function withAction<TInput, TOutput>(config: {
  readonly schema: z.ZodType<TInput>; readonly permission: Permission | null;
  readonly handler: (input: TInput, actor: Actor, correlationId: string) => Promise<TOutput>;
}): (raw: unknown) => Promise<ActionResult<TOutput>> {
  return async raw => {
    const correlationId = randomUUID();
    try {
      const actor = await requireActor();
      if (config.permission !== null) assertCan(actor, config.permission);
      const input = config.schema.safeParse(raw);
      if (!input.success) return { ok: false, code: 'invalid_input', correlationId, reasonCode: input.error.issues[0]?.code ?? 'invalid' };
      return { ok: true, data: await config.handler(input.data, actor, correlationId) };
    } catch (error) {
      if (error instanceof AuthenticationError) return { ok: false, code: 'unauthenticated', correlationId, reasonCode: error.reasonCode };
      if (error instanceof AuthorizationError) return { ok: false, code: 'forbidden', correlationId, reasonCode: error.reasonCode };
      if (error instanceof DomainRuleError) return { ok: false, code: 'rule', correlationId, reasonCode: error.code };
      if (error instanceof StaleStateError) return { ok: false, code: 'stale_state', correlationId, reasonCode: 'stale_state', currentVersion: error.currentVersion };
      if (error instanceof ValidationError) return { ok: false, code: 'invalid_input', correlationId, reasonCode: error.issues[0]?.code ?? 'invalid' };
      logger.error({ event: 'action.failed', correlationId, errorClass: safeErrorClass(error) });
      return { ok: false, code: 'internal_error', correlationId, reasonCode: null };
    }
  };
}
