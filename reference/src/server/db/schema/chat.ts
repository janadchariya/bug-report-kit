import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  CHAT_ACTION_PURPOSES,
  CHAT_MESSAGE_KINDS,
  CHAT_MESSAGE_STATUSES,
  CHAT_MESSAGE_SUBJECT_TYPES,
  CHAT_NOTIFICATIONS,
  CHAT_SPACE_STATUSES,
  CHAT_TOKEN_SUBJECT_TYPES,
} from "@/src/server/google-chat/model";
import { inList, nullOrInList } from "./sql-helpers";
import { users } from "./users";

export const chatSpaces = pgTable(
  "chat_spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    googleSpaceName: text("google_space_name").notNull().unique("chat_spaces_google_space_name_key"),
    displayName: text("display_name"),
    status: text("status").notNull().default("pending"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    eventFingerprint: text("event_fingerprint").unique("chat_spaces_event_fingerprint_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("chat_spaces_status_known", inList(table.status, CHAT_SPACE_STATUSES)),
    check("chat_spaces_active_has_user", sql`${table.status} <> 'active' or ${table.userId} is not null`),
    // One ACTIVE space per user; a disabled space keeps its owner for history and never blocks a new binding.
    uniqueIndex("chat_spaces_active_user_key").on(table.userId).where(sql`${table.status} = 'active'`),
  ],
).enableRLS();

export const chatWebhooks = pgTable(
  "chat_webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().unique("chat_webhooks_user_id_key").references(() => users.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("active"),
    encryptedUrl: text("encrypted_url"),
    googleSpaceName: text("google_space_name"),
    credentialRevision: integer("credential_revision").notNull().default(1),
    idempotencyMode: text("idempotency_mode").notNull().default("unknown"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorClass: text("last_error_class"),
    disabledReason: text("disabled_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("chat_webhooks_status_known", inList(table.status, ["active", "broken", "disabled"])),
    check("chat_webhooks_idempotency_mode_known", inList(table.idempotencyMode, ["unknown", "message_id", "none"])),
    check("chat_webhooks_credential_revision_positive", sql`${table.credentialRevision} > 0`),
    check("chat_webhooks_active_verified", sql`${table.status} <> 'active' or (${table.encryptedUrl} is not null and ${table.verifiedAt} is not null and ${table.googleSpaceName} is not null)`),
    check("chat_webhooks_disabled_cleared", sql`${table.status} <> 'disabled' or ${table.encryptedUrl} is null`),
  ],
).enableRLS();

export const chatMessages = pgTable(
  "chat_messages",
  {
    /** Source of the deterministic Google requestId/messageId. */
    id: uuid("id").primaryKey().defaultRandom(),
    dedupeKey: text("dedupe_key").notNull().unique("chat_messages_dedupe_key_key"),
    kind: text("kind").notNull(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    spaceName: text("space_name").notNull(),
    transport: text("transport").$type<"chat_api" | "webhook">().notNull().default("chat_api"),
    webhookId: uuid("webhook_id").references(() => chatWebhooks.id, { onDelete: "restrict" }),
    webhookRevision: integer("webhook_revision"),
    webhookIdempotency: text("webhook_idempotency"),
    webhookFirstAttemptRevision: integer("webhook_first_attempt_revision"),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id"),
    notification: text("notification").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    revision: integer("revision").notNull().default(1),
    providerAppliedRevision: integer("provider_applied_revision"),
    status: text("status").notNull().default("pending"),
    externalMessageName: text("external_message_name"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    lastErrorClass: text("last_error_class"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("chat_messages_subject_idx").on(table.subjectType, table.subjectId),
    index("chat_messages_recipient_created_idx").on(table.recipientUserId, table.createdAt),
    check("chat_messages_kind_known", inList(table.kind, CHAT_MESSAGE_KINDS)),
    check("chat_messages_subject_type_known", inList(table.subjectType, CHAT_MESSAGE_SUBJECT_TYPES)),
    check("chat_messages_notification_known", inList(table.notification, CHAT_NOTIFICATIONS)),
    check("chat_messages_status_known", inList(table.status, CHAT_MESSAGE_STATUSES)),
    check("chat_messages_transport_known", inList(table.transport, ["chat_api", "webhook"])),
    check("chat_messages_webhook_idempotency_known", nullOrInList(table.webhookIdempotency, ["message_id", "none"])),
    check("chat_messages_webhook_reference", sql`${table.transport} <> 'webhook' or (${table.webhookId} is not null and ${table.webhookRevision} is not null and ${table.webhookRevision} > 0)`),
    check("chat_messages_webhook_first_attempt_revision_positive", sql`${table.webhookFirstAttemptRevision} is null or ${table.webhookFirstAttemptRevision} > 0`),
    check("chat_messages_delivered_has_name", sql`${table.status} <> 'delivered' or ${table.externalMessageName} is not null`),
  ],
).enableRLS();

export const chatActionTokens = pgTable(
  "chat_action_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique("chat_action_tokens_token_hash_key"),
    purpose: text("purpose").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    issuedForUserId: uuid("issued_for_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    chatMessageId: uuid("chat_message_id").references(() => chatMessages.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    consumedByUserId: uuid("consumed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("chat_action_tokens_open_by_message_idx")
      .on(table.chatMessageId)
      .where(sql`${table.consumedAt} is null and ${table.revokedAt} is null`),
    check("chat_action_tokens_purpose_known", inList(table.purpose, CHAT_ACTION_PURPOSES)),
    check("chat_action_tokens_subject_type_known", inList(table.subjectType, CHAT_TOKEN_SUBJECT_TYPES)),
  ],
).enableRLS();

export type ChatSpaceRow = typeof chatSpaces.$inferSelect;
export type ChatWebhookRow = typeof chatWebhooks.$inferSelect;
// Captured pre-migration rows may lack acknowledgement evidence; treat omission as none.
export type ChatMessageRow = Omit<typeof chatMessages.$inferSelect, "providerAppliedRevision" | "transport" | "webhookId" | "webhookRevision" | "webhookIdempotency" | "webhookFirstAttemptRevision"> & {
  providerAppliedRevision?: number | null;
  transport?: "chat_api" | "webhook";
  webhookId?: string | null;
  webhookRevision?: number | null;
  webhookIdempotency?: string | null;
  webhookFirstAttemptRevision?: number | null;
};
export type ChatActionTokenRow = typeof chatActionTokens.$inferSelect;
