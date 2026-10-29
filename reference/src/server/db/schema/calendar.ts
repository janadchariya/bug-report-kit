import { check, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { inList } from "./sql-helpers";
import { users } from "./users";

export const CALENDAR_SUBJECT_TYPES = ["follow_up", "renewal_task"] as const;
export const CALENDAR_EVENT_STATUSES = ["pending", "synced", "failed", "cancelled"] as const;

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    /** The subject uuid without dashes: lowercase hex is valid base32hex, so the id is deterministic per subject. */
    googleEventId: text("google_event_id").notNull(),
    summary: text("summary").notNull(),
    /** A deep link only; never phone, e-mail or money. */
    description: text("description").notNull().default(""),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    revision: integer("revision").notNull().default(1),
    providerAppliedRevision: integer("provider_applied_revision"),
    status: text("status").notNull().default("pending"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastErrorClass: text("last_error_class"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("calendar_events_subject_key").on(table.subjectType, table.subjectId),
    check("calendar_events_subject_type_known", inList(table.subjectType, CALENDAR_SUBJECT_TYPES)),
    check("calendar_events_status_known", inList(table.status, CALENDAR_EVENT_STATUSES)),
  ],
).enableRLS();

// Captured pre-migration rows may lack acknowledgement evidence; treat omission as none.
export type CalendarEventRow = Omit<typeof calendarEvents.$inferSelect, "providerAppliedRevision"> & { providerAppliedRevision?: number | null };
