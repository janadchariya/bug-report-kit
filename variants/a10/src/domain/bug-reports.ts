import { z } from "zod";

// In-app bug reports (old PR gainrw/anga-a10#2, ported from github.com/janadchariya/bug-report-kit). The shapes the
// browser sees, the input rules the server applies, and the pure rules behind the badge, the status history and the
// triage form. No I/O: src/server/bugs runs them.

export const BUG_STATUSES = ["new", "in_progress", "done", "cancelled"] as const;
export const BUG_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const BUG_DEVICES = ["desktop", "tablet", "mobile"] as const;
export type BugStatus = (typeof BUG_STATUSES)[number];
export type BugPriority = (typeof BUG_PRIORITIES)[number];
export type BugDevice = (typeof BUG_DEVICES)[number];

export const STATUS_LABEL: Record<BugStatus, string> = { new: "New", in_progress: "In progress", done: "Done", cancelled: "Cancelled" };
export const PRIORITY_LABEL: Record<BugPriority, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

/** One request on the host is at most 4.5 MB, so every image the browser sends is kept under this. */
export const MAX_BUG_IMAGE_BYTES = 4 * 1024 * 1024;
/** One report per person in this window. */
export const BUG_SUBMIT_WINDOW_MS = 10_000;
/** The sidebar badge: the first read a few seconds after the page opens, then every two minutes. */
export const BUG_COUNTS_FIRST_MS = 4_000;
export const BUG_COUNTS_POLL_MS = 120_000;
/** The event a page sends when it changed what the badge counts (a report opened, sent or triaged). */
export const BUG_COUNTS_EVENT = "a10:bug-counts";

export type BugReport = {
  id: string;
  summary: string;
  description: string | null;
  reporter: { name: string | null; mine: boolean };
  screenshot_width: number;
  screenshot_height: number;
  page_url: string;
  viewport_width: number;
  viewport_height: number;
  user_agent: string;
  os_name: string | null;
  os_version: string | null;
  browser_name: string | null;
  browser_version: string | null;
  device_type: BugDevice | null;
  app_build_sha: string | null;
  status: BugStatus;
  priority: BugPriority | null;
  assignee: { key: string; name: string | null } | null;
  has_unread_reply: boolean;
  created_at: string;
  updated_at: string;
};
export type BugComment = { id: string; author: { name: string | null; mine: boolean }; body: string; has_image: boolean; created_at: string };
export type BugStatusChange = {
  id: string;
  changed_by: { name: string | null };
  from_status: BugStatus | null;
  to_status: BugStatus;
  note: string | null;
  created_at: string;
};
export type BugDetail = { bug: BugReport; comments: BugComment[]; history: BugStatusChange[]; can_triage: boolean };
export type BugPage = { items: BugReport[]; next_cursor: string | null };
export type BugCounts = { new_count: number; unread_count: number };
export type BugAssignee = { key: string; name: string };
export const BUG_LIST_SCOPES = ["assigned", "all", "reported"] as const;
export type BugListScope = (typeof BUG_LIST_SCOPES)[number];
export const BUG_SCOPE_LABEL: Record<BugListScope, string> = { assigned: "Assigned to me", all: "All reports", reported: "Reported by me" };
export const bugScopeFilters = (scope: BugListScope) => ({ mine: scope === "reported", assigned_to_me: scope === "assigned" });

/** What /bugs and /bugs/<id> render: the first page, the open report (null when it is not there), the assignees. */
export type BugsPageData =
  | { state: "ready"; isAdmin: boolean; initialScope: BugListScope; page: BugPage; detail: BugDetail | null; assignees: BugAssignee[] }
  | { state: "not-set-up"; message: string };

// ---- people --------------------------------------------------------------------------------------------------------

/** Reporters, authors and assignees are A10 actors: `anga_two:<employee id>`, the old app's form. */
export const ACTOR_KEY = /^[a-z_]{1,20}:[A-Za-z0-9_.-]{1,100}$/;
export const actorKey = (employeeId: string) => `anga_two:${employeeId}`;

/** Installer-owned roster; no production employee identities ship in this public kit. */
export { BUG_FIXERS } from "./bug-fixers";
import { BUG_FIXERS } from "./bug-fixers";
export const isBugFixer = (employeeId: string) => BUG_FIXERS.some((fixer) => fixer.employeeId === employeeId);
/** Sees every report and triages it: an A10 admin or a bug fixer. */
export const canTriageBugs = (access: { isAdmin: boolean }, employeeId: string) => access.isAdmin || isBugFixer(employeeId);

// ---- addresses -----------------------------------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const bugIdParam = z.string().regex(UUID, "Not a bug report id");

/** /bugs, or /bugs/<id> with that report open. */
export const bugPath = (id?: string | null) => (id ? `/bugs/${id}` : "/bugs");

/** The open report of /bugs/[[...bug]]: null for none, undefined for a path that is not a bug reports page. */
export function parseBugSegments(segments: readonly string[] = []): string | null | undefined {
  if (segments.length === 0) return null;
  if (segments.length === 1 && UUID.test(segments[0])) return segments[0];
  return undefined;
}

// ---- input ---------------------------------------------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => value || null);
const size = z.number().int().min(1).max(10_000);

/** The report details the browser sends beside the screenshot (the kit's CreateBody minus upload ids). */
export const bugReportMeta = z.object({
  summary: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "Add a short summary (up to 200 characters)").max(200, "Add a short summary (up to 200 characters)")),
  description: z
    .string()
    .max(4000)
    .nullish()
    .transform((value) => value?.trim() || null),
  screenshot_width: size,
  screenshot_height: size,
  page_url: z
    .url({ protocol: /^https?$/, error: "page_url must be an http(s) URL" })
    .max(2000),
  viewport_width: size,
  viewport_height: size,
  user_agent: z.string().min(1, "user_agent is required").max(1000),
  os_name: optionalText(100),
  os_version: optionalText(100),
  browser_name: optionalText(100),
  browser_version: optionalText(100),
  device_type: z.enum(BUG_DEVICES).nullish().transform((value) => value ?? null),
  app_build_sha: optionalText(100),
});
export type BugReportMeta = z.output<typeof bugReportMeta>;

/** An admin's triage change: a missing field stays as it is, null clears priority or assignee. */
export const bugUpdateBody = z
  .object({
    status: z.enum(BUG_STATUSES).optional(),
    priority: z.enum(BUG_PRIORITIES).nullable().optional(),
    assignee_key: z.string().regex(ACTOR_KEY, "Unknown assignee").nullable().optional(),
    note: z.string().max(2000, "The note is limited to 2000 characters").nullish(),
  })
  .refine((change) => change.status !== undefined || change.priority !== undefined || change.assignee_key !== undefined, "Nothing to change");
export type BugUpdate = z.output<typeof bugUpdateBody>;

/** The list filters, sent as a JSON body. */
export const bugListBody = z.object({
  status: z.enum(BUG_STATUSES).nullish(),
  priority: z.enum(BUG_PRIORITIES).nullish(),
  q: z.string().max(200).nullish(),
  mine: z.boolean().optional(),
  assigned_to_me: z.boolean().optional(),
  cursor: z.string().max(400).nullish(),
  limit: z.number().int().min(1).max(100).optional(),
});
export type BugListFilters = z.output<typeof bugListBody>;

/** Search text for an ilike pattern: PostgREST's reserved characters and the wildcards become spaces. */
export const searchText = (q: string | null | undefined) =>
  String(q ?? "")
    .replace(/[*%_,()\\"'.:]/g, " ")
    .trim()
    .slice(0, 100);

// ---- rules ---------------------------------------------------------------------------------------------------------

type ReplyState = { reporter_key: string; last_reply_at: string | null; reporter_last_read_at: string | null };

/** The reporter has an unread reply when someone else wrote after they last opened the report. */
export function hasUnreadReply(row: ReplyState, me: string): boolean {
  if (row.reporter_key !== me || !row.last_reply_at) return false;
  return !row.reporter_last_read_at || Date.parse(row.last_reply_at) > Date.parse(row.reporter_last_read_at);
}

/** The sidebar badge: new reports for admins plus my own reports with an unread reply. */
export const badgeCount = (counts: BugCounts) => counts.new_count + counts.unread_count;

/** The status history row a triage change adds: none when the status stays, the note trimmed or dropped. */
export function statusChangeOf(from: BugStatus, to: BugStatus | undefined, note: string | null | undefined) {
  if (!to || to === from) return null;
  return { from_status: from, to_status: to, note: note?.trim() || null };
}

export type TriageForm = { status: BugStatus; priority: BugPriority | ""; assignee: string; note: string };

/** What the triage form changed, as the update to send (empty when nothing changed). A note goes with a status move. */
export function triageChange(bug: Pick<BugReport, "status" | "priority" | "assignee">, form: TriageForm): Partial<BugUpdate> {
  return {
    ...(form.status !== bug.status ? { status: form.status, ...(form.note.trim() ? { note: form.note.trim() } : {}) } : {}),
    ...(form.priority !== (bug.priority ?? "") ? { priority: form.priority || null } : {}),
    ...(form.assignee !== (bug.assignee?.key ?? "") ? { assignee_key: form.assignee || null } : {}),
  };
}

/** The cards of the list, grouped by status in workflow order; empty groups are left out. */
export function groupByStatus<T extends { status: BugStatus }>(items: readonly T[]): [BugStatus, T[]][] {
  return BUG_STATUSES.map((status) => [status, items.filter((item) => item.status === status)] as [BugStatus, T[]]).filter(
    ([, rows]) => rows.length > 0,
  );
}

/** "just now", "5 min", "3 h", "2 d", then the date (kit formatRelative, in English, Bangkok time). */
export function relativeTime(iso: string, now = Date.now()): string {
  const mins = Math.floor(Math.max(0, now - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
}

export const fullTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
