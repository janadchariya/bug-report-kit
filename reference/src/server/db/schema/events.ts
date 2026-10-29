import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    type: text("type").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    actorKind: text("actor_kind").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    reason: text("reason"),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("events_actor_kind_known", sql`${table.actorKind} in ('user', 'system', 'google_chat', 'import')`),
    check("events_actor_user_required", sql`${table.actorKind} = 'system' or ${table.actorUserId} is not null`),
    index("events_subject_idx").on(table.subjectType, table.subjectId, table.occurredAt),
    index("events_type_idx").on(table.type, table.occurredAt),
  ],
).enableRLS();

export const fieldChanges = pgTable(
  "field_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    field: text("field").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    reason: text("reason"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("field_changes_entity_idx").on(table.entityType, table.entityId, table.changedAt)],
).enableRLS();

export type EventRow = typeof events.$inferSelect;
export type FieldChangeRow = typeof fieldChanges.$inferSelect;
