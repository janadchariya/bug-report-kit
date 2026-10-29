import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const rolePermissionVersions = pgTable(
  "role_permission_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: integer("version").notNull(),
    grants: jsonb("grants").notNull(),
    reason: text("reason").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("role_permission_versions_version_key").on(table.version),
    check("role_permission_versions_version_positive", sql`${table.version} >= 1`),
  ],
).enableRLS();

export type RolePermissionVersionRow = typeof rolePermissionVersions.$inferSelect;
