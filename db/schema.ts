import { sql } from "drizzle-orm";
import { boolean, check, customType, foreignKey, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { BUG_PRIORITIES, BUG_STATUSES, type BugPriority, type BugStatus } from "@/src/domain/bugs";
import { inList, nullOrInList } from "@/src/server/db/schema/sql-helpers";
import { users } from "@/src/server/db/schema/users";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => value,
  fromDriver: (value) => Buffer.from(value),
});

export const bugReports = pgTable("bug_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterUserId: uuid("reporter_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  requestId: uuid("request_id").notNull(),
  summary: text("summary").notNull(),
  description: text("description"),
  pagePath: text("page_path").notNull(),
  pageQuery: text("page_query").notNull().default(""),
  viewportWidth: integer("viewport_width").notNull(),
  viewportHeight: integer("viewport_height").notNull(),
  userAgent: text("user_agent").notNull(),
  osName: text("os_name"),
  osVersion: text("os_version"),
  browserName: text("browser_name"),
  browserVersion: text("browser_version"),
  deviceType: text("device_type"),
  appBuildSha: text("app_build_sha"),
  status: text("status").$type<BugStatus>().notNull().default("new"),
  priority: text("priority").$type<BugPriority>(),
  assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, { onDelete: "restrict" }),
  version: integer("version").notNull().default(1),
  reporterActivitySeq: integer("reporter_activity_seq").notNull().default(0),
  reporterReadSeq: integer("reporter_read_seq").notNull().default(0),
  reporterLastReadAt: timestamp("reporter_last_read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("bug_reports_reporter_request_key").on(table.reporterUserId, table.requestId),
  index("bug_reports_status_created_idx").on(table.status, table.createdAt.desc(), table.id.desc()),
  index("bug_reports_reporter_created_idx").on(table.reporterUserId, table.createdAt.desc(), table.id.desc()),
  index("bug_reports_assignee_idx").on(table.assignedToUserId).where(sql`${table.assignedToUserId} is not null`),
  index("bug_reports_unread_idx").on(table.reporterUserId).where(sql`${table.reporterReadSeq} < ${table.reporterActivitySeq}`),
  check("bug_reports_status_known", inList(table.status, BUG_STATUSES)),
  check("bug_reports_priority_known", nullOrInList(table.priority, BUG_PRIORITIES)),
  check("bug_reports_version_positive", sql`${table.version} >= 1`),
  check("bug_reports_read_bounds", sql`${table.reporterReadSeq} >= 0 and ${table.reporterActivitySeq} >= ${table.reporterReadSeq}`),
  check("bug_reports_summary_bounds", sql`length(btrim(${table.summary})) between 1 and 200`),
  check("bug_reports_description_bounds", sql`${table.description} is null or length(${table.description}) <= 4000`),
  check("bug_reports_context_bounds", sql`length(${table.pagePath}) between 1 and 2048 and length(${table.pagePath}) + length(${table.pageQuery}) + case when ${table.pageQuery} = '' then 0 else 1 end <= 2048 and length(${table.userAgent}) <= 2048`),
  check("bug_reports_viewport_bounds", sql`${table.viewportWidth} between 1 and 16384 and ${table.viewportHeight} between 1 and 16384`),
  check("bug_reports_os_known", nullOrInList(table.osName, ["Windows", "macOS", "iOS", "iPadOS", "Android", "Linux", "Chrome OS", "Unknown"])),
  check("bug_reports_browser_known", nullOrInList(table.browserName, ["Chrome", "Firefox", "Safari", "Edge", "Opera", "Samsung Internet", "Unknown"])),
  check("bug_reports_device_known", nullOrInList(table.deviceType, ["desktop", "mobile", "tablet", "unknown"])),
  check("bug_reports_versions_bounded", sql`(${table.osVersion} is null or (${table.osVersion} ~ '^[0-9]+([.][0-9]+)*$' and length(${table.osVersion}) <= 32)) and (${table.browserVersion} is null or (${table.browserVersion} ~ '^[0-9]+([.][0-9]+)*$' and length(${table.browserVersion}) <= 32))`),
  check("bug_reports_build_sha_valid", sql`${table.appBuildSha} is null or ${table.appBuildSha} ~ '^[a-fA-F0-9]{7,64}$'`),
]).enableRLS();

export const bugReportComments = pgTable("bug_report_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  bugReportId: uuid("bug_report_id").notNull().references(() => bugReports.id, { onDelete: "restrict" }),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  requestId: uuid("request_id").notNull(),
  body: text("body"),
  pendingPdf: boolean("pending_pdf").notNull().default(false),
  reporterActivitySeq: integer("reporter_activity_seq").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("bug_report_comments_author_request_key").on(table.authorUserId, table.requestId),
  unique("bug_report_comments_id_report_key").on(table.id, table.bugReportId),
  index("bug_report_comments_report_created_idx").on(table.bugReportId, table.createdAt, table.id),
  index("bug_report_comments_author_created_idx").on(table.authorUserId, table.createdAt),
  check("bug_report_comments_body_bounds", sql`${table.body} is null or length(${table.body}) <= 4000`),
  check("bug_report_comments_activity_nonnegative", sql`${table.reporterActivitySeq} >= 0`),
]).enableRLS();

export const bugReportStatusChanges = pgTable("bug_report_status_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  bugReportId: uuid("bug_report_id").notNull().references(() => bugReports.id, { onDelete: "restrict" }),
  changedByUserId: uuid("changed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  fromStatus: text("from_status").$type<BugStatus>(),
  toStatus: text("to_status").$type<BugStatus>().notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("bug_report_status_changes_report_created_idx").on(table.bugReportId, table.createdAt, table.id),
  check("bug_report_status_changes_from_known", nullOrInList(table.fromStatus, BUG_STATUSES)),
  check("bug_report_status_changes_to_known", inList(table.toStatus, BUG_STATUSES)),
  check("bug_report_status_changes_transition", sql`(${table.fromStatus} is null and ${table.toStatus} = 'new') or (${table.fromStatus} is not null and ((${table.fromStatus} = 'new' and ${table.toStatus} in ('in_progress', 'cancelled')) or (${table.fromStatus} = 'in_progress' and ${table.toStatus} in ('done', 'cancelled')) or (${table.fromStatus} in ('done', 'cancelled') and ${table.toStatus} = 'in_progress')))`),
  check("bug_report_status_changes_reason_bounds", sql`${table.reason} is null or length(btrim(${table.reason})) between 1 and 500`),
  check("bug_report_status_changes_cancel_reason", sql`${table.toStatus} <> 'cancelled' or ${table.reason} is not null`),
]).enableRLS();

export const bugReportImages = pgTable("bug_report_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  bugReportId: uuid("bug_report_id").notNull().references(() => bugReports.id, { onDelete: "restrict" }),
  commentId: uuid("comment_id"),
  kind: text("kind").$type<"screenshot" | "comment">().notNull(),
  content: bytea("content"),
  mimeType: text("mime_type").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  byteCount: integer("byte_count").notNull(),
  uploadedByUserId: uuid("uploaded_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  removedByUserId: uuid("removed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  removedReason: text("removed_reason"),
}, (table) => [
  foreignKey({ name: "bug_report_images_comment_report_fk", columns: [table.commentId, table.bugReportId], foreignColumns: [bugReportComments.id, bugReportComments.bugReportId] }).onDelete("restrict"),
  uniqueIndex("bug_report_images_screenshot_key").on(table.bugReportId).where(sql`${table.kind} = 'screenshot'`),
  uniqueIndex("bug_report_images_comment_key").on(table.commentId).where(sql`${table.commentId} is not null`),
  index("bug_report_images_report_idx").on(table.bugReportId),
  check("bug_report_images_kind_parent", sql`(${table.kind} = 'screenshot' and ${table.commentId} is null) or (${table.kind} = 'comment' and ${table.commentId} is not null)`),
  check("bug_report_images_mime_known", inList(table.mimeType, ["image/png", "image/jpeg", "image/webp"])),
  check("bug_report_images_dimensions", sql`${table.width} between 1 and 1920 and ${table.height} between 1 and 1920`),
  check("bug_report_images_bytes_bounded", sql`${table.byteCount} between 1 and 2097152 and (${table.content} is null or octet_length(${table.content}) = ${table.byteCount})`),
  check("bug_report_images_removal_consistent", sql`(${table.content} is not null and ${table.removedByUserId} is null and ${table.removedAt} is null and ${table.removedReason} is null) or (${table.content} is null and ${table.removedByUserId} is not null and ${table.removedAt} is not null and ${table.removedReason} is not null and length(btrim(${table.removedReason})) between 1 and 500)`),
]).enableRLS();

export type BugReportRow = typeof bugReports.$inferSelect;
export type BugReportCommentRow = typeof bugReportComments.$inferSelect;
export type BugReportStatusChangeRow = typeof bugReportStatusChanges.$inferSelect;
export type BugReportImageRow = typeof bugReportImages.$inferSelect;

export const bugReportFiles = pgTable("bug_report_files", {
  id: uuid('id').primaryKey().defaultRandom(),
  bugReportId: uuid('bug_report_id').notNull().references(() => bugReports.id, { onDelete: 'restrict' }),
  commentId: uuid('comment_id'),
  requestId: uuid('request_id').notNull(),
  kind: text('kind').$type<'report_pdf' | 'comment_pdf'>().notNull(),
  content: bytea('content'),
  mimeType: text('mime_type').$type<'application/pdf'>().notNull(),
  fileName: text('file_name').notNull(),
  byteCount: integer('byte_count').notNull(),
  uploadedByUserId: uuid('uploaded_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  removedByUserId: uuid('removed_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  removedAt: timestamp('removed_at', { withTimezone: true }),
  removedReason: text('removed_reason'),
}, table => [
  foreignKey({ name: 'bug_report_files_comment_report_fk', columns: [table.commentId, table.bugReportId], foreignColumns: [bugReportComments.id, bugReportComments.bugReportId] }).onDelete('restrict'),
  unique('bug_report_files_uploader_request_key').on(table.uploadedByUserId, table.requestId),
  uniqueIndex('bug_report_files_report_key').on(table.bugReportId).where(sql`${table.kind} = 'report_pdf'`),
  uniqueIndex('bug_report_files_comment_key').on(table.commentId).where(sql`${table.commentId} is not null`),
  index('bug_report_files_report_idx').on(table.bugReportId),
  index('bug_report_files_uploader_created_idx').on(table.uploadedByUserId, table.createdAt),
  check('bug_report_files_kind_parent', sql`(${table.kind} = 'report_pdf' and ${table.commentId} is null) or (${table.kind} = 'comment_pdf' and ${table.commentId} is not null)`),
  check('bug_report_files_mime_known', sql`${table.mimeType} = 'application/pdf'`),
  check('bug_report_files_filename_bounds', sql`length(btrim(${table.fileName})) between 1 and 200`),
  check('bug_report_files_bytes_bounded', sql`${table.byteCount} between 1 and 4194304 and (${table.content} is null or octet_length(${table.content}) = ${table.byteCount})`),
  check('bug_report_files_removal_consistent', sql`(${table.content} is not null and ${table.removedByUserId} is null and ${table.removedAt} is null and ${table.removedReason} is null) or (${table.content} is null and ${table.removedByUserId} is not null and ${table.removedAt} is not null and ${table.removedReason} is not null and length(btrim(${table.removedReason})) between 1 and 500)`),
]).enableRLS();
export type BugReportFileRow = typeof bugReportFiles.$inferSelect;
