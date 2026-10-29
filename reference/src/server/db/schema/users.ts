import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { USER_ROLES } from "@/src/lib/roles";

const textArray = (values: readonly string[]) =>
  sql.raw(`array[${values.map((value) => `'${value}'`).join(", ")}]::text[]`);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    nickname: text("nickname"),
    loginMethod: text("login_method").notNull(),
    roles: text("roles").array().notNull().default(sql`'{}'::text[]`),
    status: text("status").notNull().default("active"),
    googleSubject: text("google_subject"),
    googleChatUserName: text("google_chat_user_name"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("users_email_key").on(table.email),
    unique("users_google_subject_key").on(table.googleSubject),
    unique("users_google_chat_user_name_key").on(table.googleChatUserName),
    check("users_email_lowercase", sql`${table.email} = lower(${table.email})`),
    check("users_roles_known", sql`${table.roles} <@ ${textArray(USER_ROLES)}`),
    check("users_status_known", sql`${table.status} in ('active', 'inactive')`),
    check("users_login_method_known", sql`${table.loginMethod} in ('workspace', 'personal_google')`),
  ],
).enableRLS();

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionTokenHash: text("session_token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    lastTouchedAt: timestamp("last_touched_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("auth_sessions_session_token_hash_key").on(table.sessionTokenHash),
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_expires_at_idx").on(table.expiresAt),
  ],
).enableRLS();

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type AuthSessionRow = typeof authSessions.$inferSelect;
