import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Tx } from '@/src/server/db/client';
import { chatActionTokens } from '@/src/server/db/schema/chat';
import type { ChatActionPurpose } from './model';
/** Only retained for compatibility regression tests. Bug cards never issue action tokens. */
export async function issueChatActionToken(tx: Tx, input: { purpose: ChatActionPurpose; subjectType: string; subjectId: string; issuedForUserId: string; chatMessageId?: string; now: Date }) {
  const token = randomBytes(32).toString('base64url');
  const [row] = await tx.insert(chatActionTokens).values({ ...input, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(input.now.getTime()+86400000) }).returning({ id: chatActionTokens.id });
  return { token, id: row.id };
}
export async function revokeTokensForMessage(tx: Tx, id: string, now: Date): Promise<void> {
  await tx.update(chatActionTokens).set({ revokedAt: now }).where(and(eq(chatActionTokens.chatMessageId, id), isNull(chatActionTokens.revokedAt)));
}
