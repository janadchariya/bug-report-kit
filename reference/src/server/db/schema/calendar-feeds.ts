import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/** Current owner credential only. Replacing or revoking the row preserves its audit identity. */
export const calendarFeeds = pgTable("calendar_feeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique("calendar_feeds_user_id_key").references(() => users.id, { onDelete: "restrict" }),
  tokenHash: text("token_hash").notNull().unique("calendar_feeds_token_hash_key"),
  encryptedToken: text("encrypted_token"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check("calendar_feeds_token_hash_sha256", sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`)]).enableRLS();

export type CalendarFeedRow = typeof calendarFeeds.$inferSelect;
