import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "@/env";
import {
  BUG_FIXERS,
  BUG_SUBMIT_WINDOW_MS,
  MAX_BUG_IMAGE_BYTES,
  actorKey,
  bugPath,
  bugReportMeta,
  bugScopeFilters,
  isBugFixer,
  canTriageBugs,
  hasUnreadReply,
  searchText,
  type BugAssignee,
  type BugComment,
  type BugCounts,
  type BugDetail,
  type BugListFilters,
  type BugListScope,
  type BugPage,
  type BugReport,
  type BugStatusChange,
  type BugUpdate,
  type BugsPageData,
} from "@/domain/bug-reports";
import { loadAccess as loadA10Access, type LoadAccess } from "@/server/access/load-access";
import type { Viewer } from "@/server/auth/get-viewer";
import {
  BugsNotSetUpError,
  createBugQueries,
  createBugStorage,
  type BugCommentRow,
  type BugQueries,
  type BugReportRow,
  type BugStatusChangeRow,
  type BugStorage,
} from "@/server/db/bug-queries";
import { getDb } from "@/server/db/client";
import { sniffImage } from "@/server/media/images";
import { createBugChat, newBugText, type BugChat } from "./chat";
import { BugError, adminOnly, badInput, bugNotFound, imageNotFound, rateLimited, tooLarge } from "./errors";
import { createRateLimiter, type RateLimiter } from "./rate-limit";

// In-app bug reports (old PR #2 backend/bug-reports.mjs). Anyone signed in reports a problem with an annotated
// screenshot; A10 admins (loadAccess) and the bug fixers (BUG_FIXERS) triage it: status with history, priority, assignee
// (a bug fixer), and a thread with the reporter. Everyone else sees only their own reports. People are A10 actors (anga_two:<employee id>) with their name at the time.

const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEFAULT_LIMIT = 50;

export type BugImage = { bytes: Uint8Array; mime: string };
/** An upload: the text fields and the files of one multipart request. */
export type BugUpload = { fields: Record<string, string>; files: { field: string; file: Blob }[] };

export type BugReportsDeps = {
  queries: BugQueries;
  storage: BugStorage;
  loadAccess: LoadAccess;
  chat: BugChat | null;
  publicUrl: string | null;
  limiter: RateLimiter;
  now: () => Date;
  randomId: () => string;
};

// ---- cursor: created_at|id of the last row of the previous page --------------------------------------------------

export const encodeCursor = (row: { created_at: string; id: string }) => Buffer.from(`${row.created_at}|${row.id}`).toString("base64url");

export function decodeCursor(value: string | null | undefined): { at: string; id: string } | null {
  if (!value) return null;
  const [at = "", id = ""] = Buffer.from(value, "base64url").toString("utf8").split("|");
  if (!UUID.test(id) || !Number.isFinite(Date.parse(at)) || /[",()]/.test(at)) throw badInput("Invalid cursor");
  return { at, id };
}

/** The image of an upload: at most 4 MB, and PNG, JPEG or WebP by its bytes (never by the browser's label). */
export async function checkImage(file: Blob): Promise<BugImage & { ext: string }> {
  if (file.size === 0) throw badInput("Attach an image");
  if (file.size > MAX_BUG_IMAGE_BYTES) throw tooLarge();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  const ext = mime ? IMAGE_EXT[mime] : undefined;
  if (!mime || !ext) throw badInput("Images must be PNG, JPEG or WebP");
  return { bytes, mime, ext };
}

// ---- presentation: storage paths and actor keys never reach the browser ------------------------------------------

function presentBug(row: BugReportRow, me: string): BugReport {
  return {
    id: row.id,
    summary: row.summary,
    description: row.description,
    reporter: { name: row.reporter_name, mine: row.reporter_key === me },
    screenshot_width: row.screenshot_width,
    screenshot_height: row.screenshot_height,
    page_url: row.page_url,
    viewport_width: row.viewport_width,
    viewport_height: row.viewport_height,
    user_agent: row.user_agent,
    os_name: row.os_name,
    os_version: row.os_version,
    browser_name: row.browser_name,
    browser_version: row.browser_version,
    device_type: row.device_type,
    app_build_sha: row.app_build_sha,
    status: row.status,
    priority: row.priority ?? null,
    assignee: row.assignee_key ? { key: row.assignee_key, name: row.assignee_name } : null,
    has_unread_reply: hasUnreadReply(row, me),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
const presentComment = (row: BugCommentRow, me: string): BugComment => ({
  id: row.id,
  author: { name: row.author_name, mine: row.author_key === me },
  body: row.body,
  has_image: !!row.image_path,
  created_at: row.created_at,
});
const presentChange = (row: BugStatusChangeRow): BugStatusChange => ({
  id: row.id,
  changed_by: { name: row.changed_by_name },
  from_status: row.from_status,
  to_status: row.to_status,
  note: row.note,
  created_at: row.created_at,
});

// ---- the service ---------------------------------------------------------------------------------------------------

export function createBugReports(deps: BugReportsDeps) {
  const { queries, storage } = deps;
  const me = (viewer: Viewer) => actorKey(viewer.employeeId);
  const isAdmin = async (viewer: Viewer) => canTriageBugs(await deps.loadAccess(viewer), viewer.employeeId);
  const nameOf = async (viewer: Viewer) => (await queries.personName(viewer.employeeId))?.slice(0, 200) ?? null;

  // Reporter or admin; anyone else gets the same 404 as a missing report.
  async function visibleBug(viewer: Viewer, id: string, admin?: boolean): Promise<BugReportRow> {
    const row = UUID.test(id) ? await queries.get(id) : null;
    if (!row || (row.reporter_key !== me(viewer) && !(admin ?? (await isAdmin(viewer))))) throw bugNotFound();
    return row;
  }

  async function list(viewer: Viewer, filters: BugListFilters = {}, admin?: boolean): Promise<BugPage> {
    const limit = filters.limit ?? DEFAULT_LIMIT;
    const all = (admin ?? (await isAdmin(viewer))) && !filters.mine;
    const rows = await queries.list({
      reporterKey: all ? null : me(viewer),
      assigneeKey: filters.assigned_to_me ? me(viewer) : null,
      status: filters.status ?? null,
      priority: filters.priority ?? null,
      search: searchText(filters.q),
      after: decodeCursor(filters.cursor),
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    return { items: page.map((row) => presentBug(row, me(viewer))), next_cursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null };
  }

  async function counts(viewer: Viewer): Promise<BugCounts> {
    const [fresh, replied] = await Promise.all([isAdmin(viewer).then((admin) => (admin ? queries.newIds() : [])), queries.repliedTo(me(viewer))]);
    return { new_count: fresh.length, unread_count: replied.filter((row) => hasUnreadReply(row, me(viewer))).length };
  }

  // Who can be assigned: the bug fixers only (owner, 9 Nov 2026).
  async function assignees(viewer: Viewer, admin?: boolean): Promise<BugAssignee[]> {
    // Like every bug route, this says "not set up" before the migration is applied.
    await queries.ready();
    if (!(admin ?? (await isAdmin(viewer)))) throw adminOnly();
    const names = await queries.employeeNames();
    return BUG_FIXERS.map((fixer) => ({ key: actorKey(fixer.employeeId), name: names.get(fixer.employeeId) ?? fixer.name }));
  }

  async function detail(viewer: Viewer, id: string, admin?: boolean): Promise<BugDetail> {
    const triage = admin ?? (await isAdmin(viewer));
    const row = await visibleBug(viewer, id, triage);
    const [comments, history] = await Promise.all([queries.comments(id), queries.history(id)]);
    return {
      bug: presentBug(row, me(viewer)),
      comments: comments.map((c) => presentComment(c, me(viewer))),
      history: history.map(presentChange),
      can_triage: triage,
    };
  }

  async function create(viewer: Viewer, upload: BugUpload): Promise<{ id: string }> {
    let raw: unknown;
    try {
      raw = JSON.parse(upload.fields.meta ?? "");
    } catch {
      throw badInput("Report details are not valid JSON");
    }
    const meta = bugReportMeta.safeParse(raw);
    if (!meta.success) throw badInput(z.prettifyError(meta.error));
    const shots = upload.files.filter((f) => f.field === "file");
    if (shots.length !== 1 || upload.files.length !== 1) throw badInput('Attach exactly one screenshot in the "file" field');
    const image = await checkImage(shots[0].file);
    if (deps.limiter.check(me(viewer)) === "block") throw rateLimited();
    // The tables must exist before anything is stored, so a missing migration leaves no orphan image behind.
    await queries.ready();
    const id = deps.randomId();
    const path = `bug-reports/${id}/screenshot.${image.ext}`;
    await storage.put(path, image.bytes, image.mime);
    const reporterName = await nameOf(viewer);
    const at = deps.now().toISOString();
    await queries.insert({
      id,
      reporter_key: me(viewer),
      reporter_name: reporterName,
      ...meta.data,
      screenshot_path: path,
      screenshot_mime: image.mime,
      status: "new",
      created_at: at,
      updated_at: at,
    });
    if (deps.chat) {
      const link = deps.publicUrl ? new URL(bugPath(id), deps.publicUrl).href : null;
      await deps.chat(newBugText(meta.data, reporterName, link));
    }
    return { id };
  }

  async function update(viewer: Viewer, id: string, change: BugUpdate): Promise<BugDetail> {
    if (!(await isAdmin(viewer))) throw adminOnly();
    let assigneeName: string | null = null;
    if (change.assignee_key) {
      const known = (await assignees(viewer, true)).find((person) => person.key === change.assignee_key);
      if (!known) throw badInput(`Assign the report to ${new Intl.ListFormat("en", { type: "disjunction" }).format(BUG_FIXERS.map((fixer) => fixer.name))}`);
      assigneeName = known.name;
    }
    const rows = await queries.update({
      p_id: id,
      p_actor_key: me(viewer),
      p_actor_name: await nameOf(viewer),
      p_status: change.status ?? null,
      p_set_priority: change.priority !== undefined,
      p_priority: change.priority ?? null,
      p_set_assignee: change.assignee_key !== undefined,
      p_assignee_key: change.assignee_key ?? null,
      p_assignee_name: assigneeName,
      p_note: change.note ?? null,
    });
    if (rows.length === 0) throw bugNotFound();
    return detail(viewer, id, true);
  }

  async function markRead(viewer: Viewer, id: string): Promise<{ ok: true }> {
    const row = await visibleBug(viewer, id);
    if (row.reporter_key !== me(viewer)) throw new BugError(403, "FORBIDDEN", "Only the reporter can mark a report as read");
    await queries.markRead(id, deps.now().toISOString());
    return { ok: true };
  }

  async function comment(viewer: Viewer, id: string, upload: BugUpload): Promise<{ comment: BugComment }> {
    await visibleBug(viewer, id);
    const text = (upload.fields.body ?? "").trim();
    if (text.length > 4000) throw badInput("Comments are limited to 4000 characters");
    const images = upload.files.filter((f) => f.field === "file");
    if (images.length > 1 || upload.files.length !== images.length) throw badInput('Attach at most one image in the "file" field');
    if (!text && images.length === 0) throw badInput("Write a comment or attach an image");
    const commentId = deps.randomId();
    let stored: { path: string; mime: string } | null = null;
    if (images.length > 0) {
      const image = await checkImage(images[0].file);
      stored = { path: `bug-reports/${id}/comments/${commentId}.${image.ext}`, mime: image.mime };
      await storage.put(stored.path, image.bytes, image.mime);
    }
    const rows = await queries.addComment({
      p_id: commentId,
      p_bug_id: id,
      p_author_key: me(viewer),
      p_author_name: await nameOf(viewer),
      p_body: text,
      p_image_path: stored?.path ?? null,
      p_image_mime: stored?.mime ?? null,
    });
    if (rows.length === 0) throw bugNotFound();
    return { comment: presentComment(rows[0], me(viewer)) };
  }

  async function readImage(path: string, mime: string): Promise<BugImage> {
    const bytes = await storage.get(path);
    if (!bytes) throw imageNotFound();
    return { bytes, mime };
  }

  return {
    list,
    counts,
    assignees,
    detail,
    create,
    update,
    markRead,
    comment,

    async screenshot(viewer: Viewer, id: string): Promise<BugImage> {
      const row = await visibleBug(viewer, id);
      return readImage(row.screenshot_path, row.screenshot_mime);
    },

    async commentImage(viewer: Viewer, id: string, commentId: string): Promise<BugImage> {
      await visibleBug(viewer, id);
      const row = UUID.test(commentId) ? await queries.comment(id, commentId) : null;
      if (!row?.image_path || !row.image_mime) throw imageNotFound();
      return readImage(row.image_path, row.image_mime);
    },

    /** /bugs and /bugs/<id>: the first page, the open report (null when it is not there for this viewer), assignees. */
    async openPage(viewer: Viewer, bugId: string | null): Promise<BugsPageData> {
      try {
        const admin = await isAdmin(viewer);
        const initialScope: BugListScope = isBugFixer(viewer.employeeId) ? "assigned" : admin ? "all" : "reported";
        const [page, open, people] = await Promise.all([
          list(viewer, bugScopeFilters(initialScope), admin),
          bugId ? detail(viewer, bugId, admin).catch((error) => (error instanceof BugsNotSetUpError ? Promise.reject(error) : null)) : null,
          admin ? assignees(viewer, true) : [],
        ]);
        return { state: "ready", isAdmin: admin, initialScope, page, detail: open, assignees: people };
      } catch (error) {
        if (error instanceof BugsNotSetUpError) return { state: "not-set-up", message: error.message };
        throw error;
      }
    },
  };
}

export type BugReports = ReturnType<typeof createBugReports>;

// One per process: the rate limiter must be shared by every request.
let bugReports: BugReports | undefined;

/** The service wired to the A10 database and Storage, loadAccess, A10_BUG_CHAT_WEBHOOK_URL and A10_PUBLIC_URL. */
export function getBugReports(): BugReports {
  bugReports ??= createBugReports({
    queries: createBugQueries(getDb()),
    storage: createBugStorage(getDb()),
    loadAccess: loadA10Access,
    chat: createBugChat(env.A10_BUG_CHAT_WEBHOOK_URL),
    publicUrl: env.A10_PUBLIC_URL ?? null,
    limiter: createRateLimiter({ windowMs: BUG_SUBMIT_WINDOW_MS }),
    now: () => new Date(),
    randomId: randomUUID,
  });
  return bugReports;
}
