import "server-only";
import { employeeDisplayName } from "@/domain/person-name";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BugDevice, BugPriority, BugStatus } from "@/domain/bug-reports";
import type { A10Db } from "./client";
import { readEmployeeNames } from "./employee-names";

// Reads, writes and Storage calls behind bug reports. Apply db/20261022100000_a10_bug_reports.sql
// through the host migration workflow first; missing tables/functions produce BugsNotSetUpError.
// Access rules live in the service, before queries or private image responses.

export const BUG_BUCKET = "a10-bug-reports";

export type BugReportRow = {
  id: string;
  reporter_key: string;
  reporter_name: string | null;
  summary: string;
  description: string | null;
  screenshot_path: string;
  screenshot_mime: string;
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
  assignee_key: string | null;
  assignee_name: string | null;
  last_reply_at: string | null;
  reporter_last_read_at: string | null;
  created_at: string;
  updated_at: string;
};
export type BugCommentRow = {
  id: string;
  bug_id: string;
  author_key: string;
  author_name: string | null;
  body: string;
  image_path: string | null;
  image_mime: string | null;
  created_at: string;
};
export type BugStatusChangeRow = {
  id: string;
  bug_id: string;
  changed_by_key: string;
  changed_by_name: string | null;
  from_status: BugStatus | null;
  to_status: BugStatus;
  note: string | null;
  created_at: string;
};

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
type UpdateArgs = {
  p_id: string;
  p_actor_key: string;
  p_actor_name: string | null;
  p_status: BugStatus | null;
  p_set_priority: boolean;
  p_priority: BugPriority | null;
  p_set_assignee: boolean;
  p_assignee_key: string | null;
  p_assignee_name: string | null;
  p_note: string | null;
};
type CommentArgs = {
  p_id: string;
  p_bug_id: string;
  p_author_key: string;
  p_author_name: string | null;
  p_body: string;
  p_image_path: string | null;
  p_image_mime: string | null;
};

// The pending migration's objects, typed by hand: database.types.ts is generated from the baseline, which does not
// have them. Regenerate and drop this once the migration is applied and in the baseline.
type BugDatabase = {
  "A10-task-management": {
    Tables: {
      bug_reports: Table<BugReportRow, "id" | "reporter_key" | "summary" | "screenshot_path" | "screenshot_mime" | "screenshot_width" | "screenshot_height" | "page_url" | "viewport_width" | "viewport_height" | "user_agent">;
      bug_report_comments: Table<BugCommentRow, "bug_id" | "author_key" | "body">;
      bug_report_status_changes: Table<BugStatusChangeRow, "bug_id" | "changed_by_key" | "to_status">;
      people: Table<{ id: string; name: string; full_name: string | null; nickname: string | null; email: string | null; fetched_at: string }, "id" | "name" | "fetched_at">;
    };
    Views: Record<never, never>;
    Functions: {
      update_bug_report: { Args: UpdateArgs; Returns: BugReportRow[] };
      add_bug_report_comment: { Args: CommentArgs; Returns: BugCommentRow[] };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
type BugDb = SupabaseClient<BugDatabase, "A10-task-management">;

/** The migration is not applied: the tables, the functions or the bucket do not exist. */
export class BugsNotSetUpError extends Error {
  constructor(what = "the database migration is not applied") {
    super(`Bug reports are not set up yet: ${what}.`);
    this.name = "BugsNotSetUpError";
  }
}

// PostgREST: no such table (PGRST205) or function (PGRST202); Postgres: undefined table (42P01) or function (42883).
const MISSING = new Set(["PGRST205", "PGRST202", "42P01", "42883"]);

async function guard<T>(run: () => PromiseLike<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error && typeof error === "object" && MISSING.has(String((error as { code?: unknown }).code))) throw new BugsNotSetUpError();
    throw error;
  }
}

export type BugListQuery = {
  reporterKey: string | null;
  assigneeKey?: string | null;
  status: BugStatus | null;
  priority: BugPriority | null;
  search: string;
  after: { at: string; id: string } | null;
  limit: number;
};

export function createBugQueries(a10: A10Db) {
  const db = a10 as unknown as BugDb;
  const reports = () => db.from("bug_reports");
  const actorName = (key: string | null, name: string | null, names: ReadonlyMap<string, string>) => key?.startsWith("anga_two:") ? names.get(key.slice("anga_two:".length)) ?? name : name;
  const namedReports = async (rows: BugReportRow[]) => {
    if (!rows.length) return rows;
    const names = await readEmployeeNames(a10);
    return rows.map((row) => ({ ...row, reporter_name: actorName(row.reporter_key, row.reporter_name, names), assignee_name: actorName(row.assignee_key, row.assignee_name, names) }));
  };
  const namedComments = async (rows: BugCommentRow[]) => {
    if (!rows.length) return rows;
    const names = await readEmployeeNames(a10);
    return rows.map((row) => ({ ...row, author_name: actorName(row.author_key, row.author_name, names) }));
  };
  const namedChanges = async (rows: BugStatusChangeRow[]) => {
    if (!rows.length) return rows;
    const names = await readEmployeeNames(a10);
    return rows.map((row) => ({ ...row, changed_by_name: actorName(row.changed_by_key, row.changed_by_name, names) }));
  };
  return {
    employeeNames: () => readEmployeeNames(a10),

    /** Whether the tables exist; throws BugsNotSetUpError when they do not. */
    ready: () => guard(() => reports().select("id").limit(1).throwOnError()).then(() => true),

    /** Newest first (id breaks ties), `limit` rows after the cursor. */
    list: (query: BugListQuery) =>
      guard(async () => {
        let select = reports().select("*");
        if (query.assigneeKey) select = select.eq("assignee_key", query.assigneeKey);
        if (query.reporterKey) select = select.eq("reporter_key", query.reporterKey);
        if (query.status) select = select.eq("status", query.status);
        if (query.priority) select = select.eq("priority", query.priority);
        if (query.search) select = select.ilike("summary", `*${query.search}*`);
        if (query.after) {
          const at = `"${query.after.at}"`;
          select = select.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${query.after.id})`);
        }
        const { data } = await select.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(query.limit).throwOnError();
        return namedReports(data);
      }),

    get: (id: string) =>
      guard(async () => (await namedReports((await reports().select("*").eq("id", id).limit(1).throwOnError()).data))[0] ?? null),

    insert: (row: BugDatabase["A10-task-management"]["Tables"]["bug_reports"]["Insert"]) =>
      guard(async () => (await reports().insert(row).select("*").throwOnError()).data[0] ?? null),

    /** Reports waiting for triage (the admins' badge). */
    newIds: () => guard(async () => (await reports().select("id").eq("status", "new").limit(1000).throwOnError()).data),

    /** My open reports that someone has replied to: the reporter's unread badge is worked out from these. */
    repliedTo: (reporterKey: string) =>
      guard(
        async () =>
          (
            await reports()
              .select("reporter_key, last_reply_at, reporter_last_read_at")
              .eq("reporter_key", reporterKey)
              .in("status", ["new", "in_progress"])
              .not("last_reply_at", "is", null)
              .limit(1000)
              .throwOnError()
          ).data,
      ),

    markRead: (id: string, at: string) =>
      guard(() => reports().update({ reporter_last_read_at: at }).eq("id", id).throwOnError()).then(() => undefined),

    comments: (bugId: string) =>
      guard(
        async () =>
          namedComments((await db.from("bug_report_comments").select("*").eq("bug_id", bugId).order("created_at").limit(500).throwOnError()).data),
      ),

    comment: (bugId: string, commentId: string) =>
      guard(
        async () =>
          (await db.from("bug_report_comments").select("*").eq("id", commentId).eq("bug_id", bugId).limit(1).throwOnError()).data[0] ??
          null,
      ),

    history: (bugId: string) =>
      guard(
        async () =>
          namedChanges((await db.from("bug_report_status_changes").select("*").eq("bug_id", bugId).order("created_at").limit(500).throwOnError()).data),
      ),

    /** Status, priority and assignee with the history row, in one transaction. No row when the report does not exist. */
    update: (args: UpdateArgs) => guard(async () => (await db.rpc("update_bug_report", args).throwOnError()).data ?? []),

    /** A comment; one by someone other than the reporter moves last_reply_at. */
    addComment: (args: CommentArgs) => guard(async () => (await db.rpc("add_bug_report_comment", args).throwOnError()).data ?? []),

    /** The name a report or comment is signed with. */
    async personName(employeeId: string): Promise<string | null> {
      const { data } = await db
        .from("people")
        .select("name, full_name, nickname, email")
        .eq("id", employeeId)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .throwOnError();
      return data[0] ? employeeDisplayName(data[0]) : null;
    },
  };
}

export type BugQueries = ReturnType<typeof createBugQueries>;

/** A failure to save or read an image in Storage that is not a missing bucket or object. */
export class BugStorageError extends Error {
  constructor(what: "save" | "read") {
    super(`Could not ${what} the image. Retry shortly.`);
    this.name = "BugStorageError";
  }
}

type StorageFailure = { message?: string; status?: number; statusCode?: string };
const bucketMissing = (error: StorageFailure) => /bucket not found/i.test(error.message ?? "");
const objectMissing = (error: StorageFailure) =>
  error.status === 404 || error.statusCode === "404" || /not found|object not found/i.test(error.message ?? "");

/** The private bucket, with the service key. Paths are built by the server, never taken from input. */
export function createBugStorage(a10: A10Db) {
  const bucket = () => a10.storage.from(BUG_BUCKET);
  return {
    async put(path: string, bytes: Uint8Array, mime: string): Promise<void> {
      const { error } = await bucket().upload(path, bytes, { contentType: mime, upsert: false });
      if (!error) return;
      if (bucketMissing(error as StorageFailure)) throw new BugsNotSetUpError(`the Storage bucket ${BUG_BUCKET} does not exist`);
      throw new BugStorageError("save");
    },
    /** The image bytes, or null when the object (or the bucket) is not there. */
    async get(path: string): Promise<Uint8Array | null> {
      const { data, error } = await bucket().download(path);
      if (!error) return new Uint8Array(await data.arrayBuffer());
      if (bucketMissing(error as StorageFailure) || objectMissing(error as StorageFailure)) return null;
      throw new BugStorageError("read");
    },
  };
}

export type BugStorage = ReturnType<typeof createBugStorage>;
