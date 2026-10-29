import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const outboxJobs = pgTable(
  "outbox_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobType: text("job_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("outbox_jobs_dedupe_key").on(table.dedupeKey),
    check(
      "outbox_jobs_status_known",
      sql`${table.status} in ('pending', 'processing', 'succeeded', 'retryable_failed', 'dead', 'cancelled')`,
    ),
    index("outbox_jobs_claim_idx").on(table.status, table.availableAt),
  ],
).enableRLS();

export const cronHeartbeats = pgTable("cron_heartbeats", {
  name: text("name").primaryKey(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
  lastDurationMs: integer("last_duration_ms"),
  lastError: text("last_error"),
}).enableRLS();

export type OutboxJobRow = typeof outboxJobs.$inferSelect;
export type CronHeartbeatRow = typeof cronHeartbeats.$inferSelect;
