import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/src/server/db/client";
import { chatSpaces, chatWebhooks } from "@/src/server/db/schema/chat";
import { users } from "@/src/server/db/schema/users";
import { getChatProvider, type ChatProvider } from "./provider";
import { needsChatSpacePredicate } from "./space-readiness";

export type ChatDestination =
  | { transport: "chat_api"; spaceName: string }
  | { transport: "webhook"; spaceName: string; webhookId: string; webhookRevision: number; webhookIdempotency: "message_id" | "none" };
export type ChatDestinationDependencies = { provider?: Pick<ChatProvider, "mode">; webhookOnly?: boolean };

/** Webhook reachability is independent of the dormant Chat app's configuration and credentials. */
export async function resolveChatDestination(db: DbOrTx, userId: string, dependencies: ChatDestinationDependencies = {}): Promise<ChatDestination | null> {
  const [recipient] = await db.select({
    spaceName: chatSpaces.googleSpaceName,
    webhookId: chatWebhooks.id,
    webhookSpaceName: chatWebhooks.googleSpaceName,
    webhookRevision: chatWebhooks.credentialRevision,
    webhookIdempotency: chatWebhooks.idempotencyMode,
  }).from(users)
    .leftJoin(chatWebhooks, and(eq(chatWebhooks.userId, users.id), eq(chatWebhooks.status, "active")))
    .leftJoin(chatSpaces, and(eq(chatSpaces.userId, users.id), eq(chatSpaces.status, "active")))
    .where(and(eq(users.id, userId), needsChatSpacePredicate())).limit(1);
  if (!recipient) return null;
  if (recipient.webhookId && recipient.webhookSpaceName && recipient.webhookRevision) return {
    transport: "webhook", spaceName: recipient.webhookSpaceName,
    webhookId: recipient.webhookId, webhookRevision: recipient.webhookRevision,
    webhookIdempotency: recipient.webhookIdempotency === "none" ? "none" : "message_id",
  };
  if (dependencies.webhookOnly || !recipient.spaceName) return null;
  try {
    if ((dependencies.provider ?? getChatProvider()).mode === "live") return { transport: "chat_api", spaceName: recipient.spaceName };
  } catch {
    // A missing or invalid legacy WIF configuration makes its binding unreachable.
  }
  return null;
}

/** The exact same destination rule is used by notification fan-out and digest scheduling. */
export async function reachableChatUserIds(db: DbOrTx, userIds?: readonly string[], dependencies: ChatDestinationDependencies = {}): Promise<string[]> {
  if (userIds?.length === 0) return [];
  const rows = await db.select({ id: users.id }).from(users)
    .where(and(needsChatSpacePredicate(), userIds ? inArray(users.id, [...userIds]) : undefined));
  const reachable = new Set<string>();
  for (const row of rows) if (await resolveChatDestination(db, row.id, dependencies)) reachable.add(row.id);
  return userIds ? userIds.filter((id) => reachable.has(id)) : rows.filter((row) => reachable.has(row.id)).map((row) => row.id);
}
