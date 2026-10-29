import "server-only";
import { and, desc, eq, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { BUG_PRIORITIES, BUG_STATUSES, type BugPriority, type BugStatus } from "@/src/domain/bugs";
import type { BugComment, BugDetail, BugImageMeta, BugListItem, BugStatusChange } from "@/src/lib/bugs/types";
import { escapeBugSummarySearch } from "@/src/lib/bugs/list";
import type { Actor } from "@/src/server/auth/actor";
import type { Db, DbOrTx } from "@/src/server/db/client";
import { bugReportComments, bugReportFiles, bugReportImages, bugReports, bugReportStatusChanges } from "@/src/server/db/schema/bugs";
import { users } from "@/src/server/db/schema/users";
import { DomainRuleError } from "@/src/server/errors";
import { listActiveBugTriagers, requireBugActor } from "./access";
import { bugPdfFields, toBugPdfMeta } from './files';

type BugScope = "triage" | "mine";
type Cursor = { createdAt: string; id: string };
type Page<T> = { items: T[]; nextCursor: string | null };
export type BugThreadPage = Pick<BugDetail, "comments" | "statusChanges" | "commentsBefore" | "historyBefore">;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Keep full Postgres timestamp precision inside cursors; JS Dates truncate microseconds.
const cursorTime = (column: PgColumn | SQL) => sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const encodeCursor = (row: { id: string; cursorAt: string }): string => Buffer.from(JSON.stringify({ createdAt: row.cursorAt, id: row.id })).toString("base64url");
function decodeCursor(value?: string): Cursor | undefined {
  if (value === undefined) return undefined;
  try {
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) throw new Error();
    const { createdAt, id } = parsed as Record<string, unknown>;
    if (typeof id !== "string" || !UUID.test(id) || typeof createdAt !== "string"
      || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/.test(createdAt) || !Number.isFinite(Date.parse(createdAt))
      || new Date(createdAt).toISOString().slice(0, 19) !== createdAt.slice(0, 19)) throw new Error();
    return { createdAt, id };
  } catch { throw new DomainRuleError("invalid_bug_cursor"); }
}
function olderThan(createdAt: PgColumn | SQL, id: PgColumn, cursor?: Cursor): SQL | undefined {
  return cursor ? or(sql`${createdAt} < ${cursor.createdAt}::timestamptz`, and(sql`${createdAt} = ${cursor.createdAt}::timestamptz`, lt(id, cursor.id))) : undefined;
}
function pageLimit(value?: number): number {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > 100)) throw new DomainRuleError("invalid_bug_limit");
  return value ?? 50;
}
async function scopeActor(db: DbOrTx, actor: Actor, scope: BugScope): Promise<Actor> {
  const current = await requireBugActor(db, actor);
  if ((scope !== "mine" && scope !== "triage") || !current.permissions.has(scope === "triage" ? "bugs.triage" : "bugs.report")) {
    throw new DomainRuleError("bug_not_visible");
  }
  return current;
}
function scopeWhere(actor: Actor, scope: BugScope): SQL | undefined {
  return scope === "mine" ? eq(bugReports.reporterUserId, actor.userId) : undefined;
}

const listFields = {
  hasPdf: sql<boolean>`exists(select 1 from ${bugReportFiles} where ${bugReportFiles.bugReportId} = ${bugReports.id} and ${bugReportFiles.kind} = 'report_pdf' and ${bugReportFiles.removedAt} is null)`,
  id: bugReports.id, summary: bugReports.summary, status: bugReports.status, priority: bugReports.priority,
  reporterUserId: bugReports.reporterUserId, assignedToUserId: bugReports.assignedToUserId, version: bugReports.version,
  reporterActivitySeq: bugReports.reporterActivitySeq, reporterReadSeq: bugReports.reporterReadSeq,
  createdAt: bugReports.createdAt, updatedAt: bugReports.updatedAt, cursorAt: cursorTime(bugReports.createdAt),
};
type ListRow = Pick<typeof bugReports.$inferSelect, "id" | "summary" | "status" | "priority" | "reporterUserId" | "assignedToUserId" | "version" | "reporterActivitySeq" | "reporterReadSeq" | "createdAt" | "updatedAt"> & { screenshotImageId?: string | null; hasPdf?: boolean };
async function listItems(db: DbOrTx, rows: ListRow[], scope: BugScope): Promise<BugListItem[]> {
  const labels = new Map<string, { id: string; displayName: string; nickname: string | null }>();
  let eligible = new Set<string>();
  if (scope === "triage" && rows.length) {
    const userIds = [...new Set(rows.flatMap((row) => [row.reporterUserId, ...(row.assignedToUserId ? [row.assignedToUserId] : [])]))];
    const staff = await db.select({ id: users.id, displayName: users.displayName, nickname: users.nickname }).from(users).where(inArray(users.id, userIds));
    for (const user of staff) labels.set(user.id, user);
    eligible = new Set((await listActiveBugTriagers(db)).map((user) => user.id));
  }
  return rows.map((row) => {
    const item: BugListItem = {
      screenshotImageId: row.screenshotImageId ?? null,
      hasPdf: row.hasPdf ?? false,
      id: row.id, summary: row.summary, status: row.status, priority: row.priority, assigned: row.assignedToUserId !== null,
      version: row.version, reporterActivitySeq: row.reporterActivitySeq, reporterReadSeq: row.reporterReadSeq,
      unread: row.reporterReadSeq < row.reporterActivitySeq, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    };
    if (scope === "triage") {
      item.assignedToUserId = row.assignedToUserId;
      item.reporter = labels.get(row.reporterUserId);
      const assigned = row.assignedToUserId ? labels.get(row.assignedToUserId) : undefined;
      item.assignee = assigned ? { ...assigned, available: eligible.has(assigned.id) } : null;
    }
    return item;
  });
}

export async function listBugs(db: DbOrTx, input: {
  actor: Actor; scope: BugScope; status?: BugStatus; priority?: BugPriority | null; assigneeId?: string | null; cursor?: string; limit?: number; q?: string;
}): Promise<Page<BugListItem>> {
  const actor = await scopeActor(db, input.actor, input.scope);
  if ((input.status !== undefined && !BUG_STATUSES.includes(input.status))
    || (input.priority !== undefined && input.priority !== null && !BUG_PRIORITIES.includes(input.priority))
    || (input.assigneeId !== undefined && input.assigneeId !== null && !UUID.test(input.assigneeId))) throw new DomainRuleError("invalid_bug_filter");
  if (input.q !== undefined && (typeof input.q !== "string" || input.q.trim().length < 1 || input.q.trim().length > 100)) throw new DomainRuleError("invalid_bug_filter");
  const limit = pageLimit(input.limit), cursor = decodeCursor(input.cursor);
  const rows = await db.select({ ...listFields, screenshotImageId: bugReportImages.id }).from(bugReports)
    .leftJoin(bugReportImages, and(eq(bugReportImages.bugReportId, bugReports.id), eq(bugReportImages.kind, "screenshot"), isNull(bugReportImages.removedAt)))
    .where(and(
    scopeWhere(actor, input.scope), input.status ? eq(bugReports.status, input.status) : undefined,
    input.priority === null ? isNull(bugReports.priority) : input.priority ? eq(bugReports.priority, input.priority) : undefined,
    input.assigneeId === null ? isNull(bugReports.assignedToUserId) : input.assigneeId ? eq(bugReports.assignedToUserId, input.assigneeId) : undefined,
    input.q ? ilike(bugReports.summary, `%${escapeBugSummarySearch(input.q.trim())}%`) : undefined,
    olderThan(bugReports.createdAt, bugReports.id, cursor),
  )).orderBy(desc(bugReports.createdAt), desc(bugReports.id)).limit(limit + 1);
  const shown = rows.slice(0, limit);
  return { items: await listItems(db, shown, input.scope), nextCursor: rows.length > limit ? encodeCursor(shown[shown.length - 1]) : null };
}

const imageFields = {
  id: bugReportImages.id, commentId: bugReportImages.commentId, kind: bugReportImages.kind, mimeType: bugReportImages.mimeType,
  width: bugReportImages.width, height: bugReportImages.height, byteCount: bugReportImages.byteCount, removedAt: bugReportImages.removedAt,
};
export function toBugImageMeta(row: Omit<BugImageMeta, "removed" | "url"> & { removedAt: Date | null }): BugImageMeta {
  return { id: row.id, kind: row.kind, mimeType: row.mimeType, width: row.width, height: row.height, byteCount: row.byteCount,
    removed: row.removedAt !== null, url: row.removedAt === null ? `/api/bugs/images/${row.id}` : null };
}
async function commentsPage(db: DbOrTx, bugId: string, actor: Actor, scope: BugScope, limit: number, before?: Cursor): Promise<Page<BugComment>> {
  // A PDF can arrive long after its pending comment. Page by the latest visible
  // activity so detail cannot acknowledge that upload while omitting its comment.
  // Keep tombstones in this key so removal cannot move a row across a cursor.
  const activityAt = sql`greatest(${bugReportComments.createdAt}, ${bugReportFiles.createdAt})`;
  const rows = await db.select({ id: bugReportComments.id, authorUserId: bugReportComments.authorUserId, body: bugReportComments.body,
    pendingPdf: bugReportComments.pendingPdf,
    createdAt: bugReportComments.createdAt, cursorAt: cursorTime(activityAt),
  }).from(bugReportComments).leftJoin(bugReportFiles, and(
    eq(bugReportFiles.commentId, bugReportComments.id), eq(bugReportFiles.bugReportId, bugReportComments.bugReportId),
    eq(bugReportFiles.kind, "comment_pdf"),
  )).where(and(eq(bugReportComments.bugReportId, bugId), olderThan(activityAt, bugReportComments.id, before)))
    .orderBy(desc(activityAt), desc(bugReportComments.id)).limit(limit + 1);
  const shown = rows.slice(0, limit);
  const images = shown.length ? await db.select(imageFields).from(bugReportImages).where(and(
    eq(bugReportImages.bugReportId, bugId), inArray(bugReportImages.commentId, shown.map((row) => row.id)),
  )) : [];
  const imageByComment = new Map(images.map((row) => [row.commentId, toBugImageMeta(row)]));
  const files = shown.length ? await db.select({ ...bugPdfFields, commentId: bugReportFiles.commentId }).from(bugReportFiles).where(and(
    eq(bugReportFiles.bugReportId, bugId), inArray(bugReportFiles.commentId, shown.map(row => row.id)),
  )) : [];
  const pdfByComment = new Map(files.map(row => [row.commentId, toBugPdfMeta(row)]));
  const nextCursor = rows.length > limit ? encodeCursor(shown[shown.length - 1]) : null;
  return { items: shown.reverse().map((row) => ({ id: row.id, isMine: row.authorUserId === actor.userId,
    ...(scope === "triage" ? { authorUserId: row.authorUserId } : {}), body: row.body,
    createdAt: row.createdAt.toISOString(), image: imageByComment.get(row.id) ?? null, pdf: pdfByComment.get(row.id) ?? null, pendingPdf: row.pendingPdf })), nextCursor };
}
async function historyPage(db: DbOrTx, bugId: string, actor: Actor, scope: BugScope, limit: number, before?: Cursor): Promise<Page<BugStatusChange>> {
  const rows = await db.select({ id: bugReportStatusChanges.id, changedByUserId: bugReportStatusChanges.changedByUserId,
    fromStatus: bugReportStatusChanges.fromStatus, toStatus: bugReportStatusChanges.toStatus, reason: bugReportStatusChanges.reason,
    createdAt: bugReportStatusChanges.createdAt, cursorAt: cursorTime(bugReportStatusChanges.createdAt),
  }).from(bugReportStatusChanges).where(and(eq(bugReportStatusChanges.bugReportId, bugId), olderThan(bugReportStatusChanges.createdAt, bugReportStatusChanges.id, before)))
    .orderBy(desc(bugReportStatusChanges.createdAt), desc(bugReportStatusChanges.id)).limit(limit + 1);
  const shown = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? encodeCursor(shown[shown.length - 1]) : null;
  return { items: shown.reverse().map((row) => ({ id: row.id, isMine: row.changedByUserId === actor.userId,
    ...(scope === "triage" ? { changedByUserId: row.changedByUserId } : {}), fromStatus: row.fromStatus,
    toStatus: row.toStatus, reason: row.reason, createdAt: row.createdAt.toISOString() })), nextCursor };
}

/** All visible activity and its acknowledgement watermark come from one read-only snapshot. */
export async function getBugDetail(db: Db, input: { actor: Actor; bugId: string; scope: BugScope }): Promise<BugDetail> {
  return db.transaction(async (tx) => {
    const actor = await scopeActor(tx, input.actor, input.scope);
    if (!UUID.test(input.bugId)) throw new DomainRuleError("bug_not_visible");
    const [row] = await tx.select({ ...listFields, ...(input.scope === "triage" ? { userAgent: bugReports.userAgent } : {}), description: bugReports.description, pagePath: bugReports.pagePath, pageQuery: bugReports.pageQuery,
      viewportWidth: bugReports.viewportWidth, viewportHeight: bugReports.viewportHeight, osName: bugReports.osName, osVersion: bugReports.osVersion,
      browserName: bugReports.browserName, browserVersion: bugReports.browserVersion, deviceType: bugReports.deviceType, appBuildSha: bugReports.appBuildSha,
    }).from(bugReports).where(and(eq(bugReports.id, input.bugId), scopeWhere(actor, input.scope))).limit(1);
    if (!row) throw new DomainRuleError("bug_not_visible");
    const [item] = await listItems(tx, [row], input.scope);
    const comments = await commentsPage(tx, row.id, actor, input.scope, 50);
    const history = await historyPage(tx, row.id, actor, input.scope, 50);
    const [screenshot] = await tx.select(imageFields).from(bugReportImages).where(and(eq(bugReportImages.bugReportId, row.id), eq(bugReportImages.kind, "screenshot"))).limit(1);
    const [pdf] = await tx.select(bugPdfFields).from(bugReportFiles).where(and(eq(bugReportFiles.bugReportId, row.id), eq(bugReportFiles.kind, 'report_pdf'))).limit(1);
    return { ...item, ...(input.scope === "triage" ? { userAgent: row.userAgent } : {}), screenshotImageId: screenshot?.removedAt === null ? screenshot.id : null, isOwner: row.reporterUserId === actor.userId, description: row.description, pagePath: row.pagePath, pageQuery: row.pageQuery,
      viewportWidth: row.viewportWidth, viewportHeight: row.viewportHeight, osName: row.osName, osVersion: row.osVersion,
      browserName: row.browserName, browserVersion: row.browserVersion, deviceType: row.deviceType, appBuildSha: row.appBuildSha,
      screenshot: screenshot ? toBugImageMeta(screenshot) : null, pdf: pdf ? toBugPdfMeta(pdf) : null, comments: comments.items, statusChanges: history.items,
      commentsBefore: comments.nextCursor, historyBefore: history.nextCursor, seenActivitySeq: row.reporterActivitySeq };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

/** Older-page loads deliberately return no watermark and cannot acknowledge newer activity. */
export async function loadBugThread(db: Db, input: {
  actor: Actor; bugId: string; scope: BugScope; commentsBefore?: string; historyBefore?: string; limit?: number;
}): Promise<BugThreadPage> {
  return db.transaction(async (tx) => {
    const actor = await scopeActor(tx, input.actor, input.scope);
    if (!UUID.test(input.bugId)) throw new DomainRuleError("bug_not_visible");
    const [report] = await tx.select({ id: bugReports.id }).from(bugReports)
      .where(and(eq(bugReports.id, input.bugId), scopeWhere(actor, input.scope))).limit(1);
    if (!report) throw new DomainRuleError("bug_not_visible");
    const limit = pageLimit(input.limit);
    const comments = input.commentsBefore === undefined ? { items: [], nextCursor: null } : await commentsPage(tx, report.id, actor, input.scope, limit, decodeCursor(input.commentsBefore));
    const history = input.historyBefore === undefined ? { items: [], nextCursor: null } : await historyPage(tx, report.id, actor, input.scope, limit, decodeCursor(input.historyBefore));
    return { comments: comments.items, statusChanges: history.items, commentsBefore: comments.nextCursor, historyBefore: history.nextCursor };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
