import { vi } from "vitest";
vi.mock("@/domain/bug-fixers", () => import("@/../tests/bug-fixers.fixture"));
import { describe, expect, test } from "vitest";
import { BUG_FIXERS, bugListBody, bugReportMeta, bugUpdateBody, statusChangeOf, type BugStatus } from "@/domain/bug-reports";
import type { EmployeeId, PersonId } from "@/domain/model";
import { createLoadAccess } from "@/server/access/load-access";
import type { Viewer } from "@/server/auth/get-viewer";
import { createAccessQueries } from "@/server/db/access-queries";
import { BugsNotSetUpError, createBugQueries, createBugStorage, type BugStorage } from "@/server/db/bug-queries";
import { createFakeDb } from "@/server/db/fake-db";
import { createBugReports, decodeCursor, encodeCursor, type BugUpload } from "./bug-reports";
import { newBugText } from "./chat";
import { BugError } from "./errors";
import { createRateLimiter } from "./rate-limit";

// Ported from the old PR's tests/bug-reports.test.js: the real queries over createFakeDb(), Storage as a Map.

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const BEE_ID = "22222222-2222-4222-8222-222222222222";
const CAT_ID = "33333333-3333-4333-8333-333333333333";
const viewer = (id: string): Viewer => ({ employeeId: id as EmployeeId, clickUpId: null as PersonId | null });
const admin = viewer(ADMIN_ID);
const bee = viewer(BEE_ID);
const cat = viewer(CAT_ID);
const [DEV_ALPHA, DEV_BETA] = BUG_FIXERS;
const developer = viewer(DEV_ALPHA.employeeId);
const fixerKeys = BUG_FIXERS.map((fixer) => ({ key: `anga_two:${fixer.employeeId}`, name: fixer.name }));
const MISSING_ID = "99999999-9999-4999-8999-999999999999";

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...Array(32).fill(1)]);
const JPEG = Uint8Array.from([255, 216, 255, 224, ...Array(32).fill(2)]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');

const meta = (over: Record<string, unknown> = {}) => ({
  summary: "Save button does nothing",
  description: "Clicked twice",
  page_url: "http://127.0.0.1:3401/my-work",
  viewport_width: 1440,
  viewport_height: 900,
  user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36",
  os_name: "macOS",
  os_version: "10.15.7",
  browser_name: "Chrome",
  browser_version: "141.0.0.0",
  device_type: "desktop",
  app_build_sha: null,
  screenshot_width: 1200,
  screenshot_height: 800,
  ...over,
});
const blob = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>]);
const report = (over: Record<string, unknown> = {}, file: Uint8Array | null = PNG): BugUpload => ({
  fields: { meta: JSON.stringify(meta(over)) },
  files: file ? [{ field: "file", file: blob(file) }] : [],
});
const message = (body: string, file?: Uint8Array): BugUpload => ({ fields: { body }, files: file ? [{ field: "file", file: blob(file) }] : [] });

type Row = Record<string, unknown>;

function world({ chat = null as ((text: string) => Promise<void>) | null, notSetUp = false, people = [] as Row[] } = {}) {
  const clock = { now: Date.parse("2026-10-22T03:00:00.000Z") };
  const tick = () => new Date((clock.now += 1000)).toISOString();
  const bugReports: Row[] = [];
  const comments: Row[] = [];
  const history: Row[] = [];
  let n = 0;
  const randomId = () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++n).padStart(12, "0")}`;
  const missing = () => Response.json({ code: "PGRST205", message: "Could not find the table in the schema cache" }, { status: 404 });

  // The two functions of the pending migration, as the SQL defines them.
  const updateBugReport = async (_url: URL, request: Request) => {
    const p = await request.json();
    const bug = bugReports.find((row) => row.id === p.p_id);
    if (!bug) return Response.json([]);
    const change = statusChangeOf(bug.status as BugStatus, p.p_status ?? undefined, p.p_note);
    if (p.p_status) bug.status = p.p_status;
    if (p.p_set_priority) bug.priority = p.p_priority;
    if (p.p_set_assignee) Object.assign(bug, { assignee_key: p.p_assignee_key, assignee_name: p.p_assignee_name });
    if (change) history.push({ id: randomId(), bug_id: p.p_id, changed_by_key: p.p_actor_key, changed_by_name: p.p_actor_name, ...change, created_at: tick() });
    return Response.json([{ ...bug }]);
  };
  const addComment = async (_url: URL, request: Request) => {
    const p = await request.json();
    const bug = bugReports.find((row) => row.id === p.p_bug_id);
    if (!bug) return Response.json([]);
    const row = { id: p.p_id, bug_id: p.p_bug_id, author_key: p.p_author_key, author_name: p.p_author_name, body: p.p_body.trim(), image_path: p.p_image_path, image_mime: p.p_image_mime, created_at: tick() };
    comments.push(row);
    if (bug.reporter_key !== p.p_author_key) bug.last_reply_at = row.created_at;
    return Response.json([row]);
  };

  const fake = createFakeDb(
    {
      bug_reports: notSetUp ? missing : bugReports,
      bug_report_comments: notSetUp ? missing : comments,
      bug_report_status_changes: notSetUp ? missing : history,
      "rpc/update_bug_report": notSetUp ? missing : updateBugReport,
      "rpc/add_bug_report_comment": notSetUp ? missing : addComment,
      a10_admins: [{ employee_id: ADMIN_ID, name: "Administrator" }],
      a10_leads: [],
      people: [
        { id: ADMIN_ID, name: "Administrator", full_name: "Administrator Example", fetched_at: "2026-10-01T00:00:00Z" },
        { id: BEE_ID, name: "Bee", full_name: null, fetched_at: "2026-10-01T00:00:00Z" },
        { id: CAT_ID, name: "Cat", full_name: null, fetched_at: "2026-10-01T00:00:00Z" },
        ...people,
      ],
      unit_access: [],
      workspaces: [],
      workspace_access: [],
      accounts: [],
    },
    { orderAndLimit: true },
  );
  const objects = new Map<string, { bytes: Uint8Array; mime: string }>();
  const storage: BugStorage = {
    put: async (path, bytes, mime) => void objects.set(path, { bytes, mime }),
    get: async (path) => objects.get(path)?.bytes ?? null,
  };
  const bugs = createBugReports({
    queries: createBugQueries(fake.db),
    storage,
    loadAccess: createLoadAccess({ queries: createAccessQueries(fake.db), lockedUnits: [] }),
    chat,
    publicUrl: "https://a10.example.com",
    limiter: createRateLimiter({ windowMs: 10_000, clock: () => clock.now }),
    now: () => new Date((clock.now += 1000)),
    randomId,
  });
  return { bugs, clock, bugReports, comments, objects };
}

const fails = (status: number, code?: string) => (error: unknown) =>
  error instanceof BugError && error.status === status && (code === undefined || error.code === code);

describe("bug reports", () => {
  test("a report stores its screenshot under a server-made path and the reporter sees it", async () => {
    const w = world();
    const { id } = await w.bugs.create(bee, report());
    const row = w.bugReports[0];
    expect(row).toMatchObject({ id, reporter_key: `anga_two:${BEE_ID}`, reporter_name: "Bee", screenshot_path: `bug-reports/${id}/screenshot.png`, screenshot_mime: "image/png", status: "new" });
    expect([...w.objects.keys()]).toEqual([row.screenshot_path]);
    const detail = await w.bugs.detail(bee, id);
    expect(detail.bug.summary).toBe("Save button does nothing");
    expect(detail.bug.reporter.mine).toBe(true);
    expect(detail.can_triage).toBe(false);
    expect("screenshot_path" in detail.bug).toBe(false);
    expect(JSON.stringify(detail)).not.toContain("anga_two:");
    expect(await w.bugs.screenshot(bee, id)).toEqual({ bytes: PNG, mime: "image/png" });
  });

  test("the image type comes from its bytes; non-images, missing files and bad details are refused", async () => {
    const w = world();
    const { id } = await w.bugs.create(bee, report({}, JPEG));
    expect(w.bugReports.find((b) => b.id === id)?.screenshot_path).toBe(`bug-reports/${id}/screenshot.jpg`);
    await expect(w.bugs.create(cat, report({}, SVG))).rejects.toSatisfy(fails(400));
    await expect(w.bugs.create(cat, report({}, null))).rejects.toSatisfy(fails(400));
    await expect(w.bugs.create(cat, report({ summary: "   " }))).rejects.toSatisfy(fails(400));
    await expect(w.bugs.create(cat, report({ page_url: "javascript:alert(1)" }))).rejects.toSatisfy(fails(400));
    await expect(w.bugs.create(cat, report({ screenshot_width: 0 }))).rejects.toSatisfy(fails(400));
    await expect(w.bugs.create(cat, { fields: { meta: "{" }, files: [] })).rejects.toSatisfy(fails(400));
    const huge = new Uint8Array(4 * 1024 * 1024 + 1);
    huge.set(PNG);
    await expect(w.bugs.create(cat, report({}, huge))).rejects.toSatisfy(fails(413, "FILE_TOO_LARGE"));
    expect(w.bugReports).toHaveLength(1);
    expect(w.objects.size).toBe(1);
  });

  test("one report per person every 10 seconds", async () => {
    const w = world();
    await w.bugs.create(bee, report());
    await expect(w.bugs.create(bee, report())).rejects.toSatisfy(fails(429, "RATE_LIMITED"));
    await w.bugs.create(cat, report());
    w.clock.now += 10_000;
    await w.bugs.create(bee, report());
    expect(w.bugReports).toHaveLength(3);
  });

  test("people list only their own reports; admins see all, filter, search and page", async () => {
    const w = world();
    for (const [who, summary] of [[bee, "Board is blank"], [cat, "Chat freezes"], [bee, "Board flickers"], [admin, "Login loop"]] as const) {
      await w.bugs.create(who, report({ summary }));
      w.clock.now += 11_000;
    }
    const summaries = (page: { items: { summary: string }[] }) => page.items.map((b) => b.summary);
    expect(summaries(await w.bugs.list(bee))).toEqual(["Board flickers", "Board is blank"]);
    expect(summaries(await w.bugs.list(admin))).toEqual(["Login loop", "Board flickers", "Chat freezes", "Board is blank"]);
    expect(summaries(await w.bugs.list(admin, { mine: true }))).toEqual(["Login loop"]);
    expect(summaries(await w.bugs.list(admin, { q: "board" }))).toEqual(["Board flickers", "Board is blank"]);
    expect(summaries(await w.bugs.list(bee, { q: "chat" }))).toEqual([]);
    const first = await w.bugs.list(admin, { limit: 3 });
    expect(first.items).toHaveLength(3);
    const second = await w.bugs.list(admin, { limit: 3, cursor: first.next_cursor });
    expect(summaries(second)).toEqual(["Board is blank"]);
    expect(second.next_cursor).toBeNull();
    expect(bugListBody.safeParse({ status: "open" }).success).toBe(false);
  });

  test("only the reporter and admins can open a report, its screenshot or its thread", async () => {
    const w = world();
    const { id } = await w.bugs.create(bee, report());
    await expect(w.bugs.detail(cat, id)).rejects.toSatisfy(fails(404));
    await expect(w.bugs.screenshot(cat, id)).rejects.toSatisfy(fails(404));
    await expect(w.bugs.comment(cat, id, message("me too"))).rejects.toSatisfy(fails(404));
    expect((await w.bugs.detail(admin, id)).can_triage).toBe(true);
    await expect(w.bugs.detail(admin, MISSING_ID)).rejects.toSatisfy(fails(404));
    expect(w.comments).toHaveLength(0);
  });

  test("admins change status with history, priority and assignee; others cannot", async () => {
    const w = world();
    const { id } = await w.bugs.create(bee, report());
    await expect(w.bugs.update(bee, id, { status: "done" })).rejects.toSatisfy(fails(403, "ADMIN_ONLY"));
    let d = await w.bugs.update(admin, id, { status: "in_progress", priority: "high", assignee_key: `anga_two:${DEV_ALPHA.employeeId}`, note: " looking " });
    expect(d.bug).toMatchObject({ status: "in_progress", priority: "high", assignee: { key: `anga_two:${DEV_ALPHA.employeeId}`, name: DEV_ALPHA.name } });
    expect(d.history.map((h) => [h.from_status, h.to_status, h.note, h.changed_by.name])).toEqual([["new", "in_progress", "looking", "Administrator"]]);
    d = await w.bugs.update(admin, id, { status: "in_progress", priority: null });
    expect(d.bug.priority).toBeNull();
    expect(d.history).toHaveLength(1);
    await expect(w.bugs.update(admin, id, { assignee_key: `anga_two:${BEE_ID}` })).rejects.toSatisfy(fails(400));
    await expect(w.bugs.update(admin, id, { assignee_key: `anga_two:${ADMIN_ID}` })).rejects.toSatisfy(fails(400));
    await expect(w.bugs.update(admin, MISSING_ID, { status: "done" })).rejects.toSatisfy(fails(404));
    expect(bugUpdateBody.safeParse({}).success).toBe(false);
    expect(bugUpdateBody.safeParse({ note: "only a note" }).success).toBe(false);
    expect(bugUpdateBody.safeParse({ status: "closed" }).success).toBe(false);
    expect(bugUpdateBody.safeParse({ priority: null }).data).toEqual({ priority: null });
  });

  test("a reply from an admin raises the reporter's unread badge until they open it; their own comments do not", async () => {
    const w = world();
    const { id } = await w.bugs.create(bee, report());
    await w.bugs.create(cat, report());
    expect(await w.bugs.counts(admin)).toEqual({ new_count: 2, unread_count: 0 });
    expect(await w.bugs.counts(bee)).toEqual({ new_count: 0, unread_count: 0 });
    await w.bugs.comment(bee, id, message("Still broken"));
    expect((await w.bugs.counts(bee)).unread_count).toBe(0);
    const { comment: reply } = await w.bugs.comment(admin, id, message("Which browser?", PNG));
    expect(reply).toMatchObject({ has_image: true, author: { mine: true } });
    expect((await w.bugs.counts(bee)).unread_count).toBe(1);
    expect((await w.bugs.list(bee)).items[0].has_unread_reply).toBe(true);
    await expect(w.bugs.markRead(admin, id)).rejects.toSatisfy(fails(403));
    await w.bugs.markRead(bee, id);
    expect((await w.bugs.counts(bee)).unread_count).toBe(0);
    expect((await w.bugs.commentImage(bee, id, reply.id)).bytes).toEqual(PNG);
    await expect(w.bugs.commentImage(cat, id, reply.id)).rejects.toSatisfy(fails(404));
    const thread = (await w.bugs.detail(bee, id)).comments.map((c) => [c.author.name, c.author.mine, c.body]);
    expect(thread).toEqual([["Bee", true, "Still broken"], ["Administrator", false, "Which browser?"]]);
    await expect(w.bugs.comment(bee, id, message("   "))).rejects.toSatisfy(fails(400));
  });

  test("assignees are the bug fixers only, configured developers; others are refused", async () => {
    const w = world();
    expect(fixerKeys.map((fixer) => fixer.name)).toEqual(["Developer Alpha", "Developer Beta", "Developer Gamma", "Developer Delta", "Developer Epsilon"]);
    expect(await w.bugs.assignees(admin)).toEqual(fixerKeys);
    expect(await w.bugs.assignees(developer)).toEqual(fixerKeys);
    await expect(w.bugs.assignees(bee)).rejects.toSatisfy(fails(403));
  });

  test("fixed bug assignees use their current TWO names without widening the allowed identities", async () => {
    const w = world({ people: [{ id: DEV_ALPHA.employeeId, name: "Stale configured label", full_name: "Changed Surname", nickname: "RenamedDev", fetched_at: "2026-11-10T00:00:00Z" }] });
    const assigned = await w.bugs.assignees(admin);
    expect(assigned).toEqual([{ key: `anga_two:${DEV_ALPHA.employeeId}`, name: "RenamedDev Changed" }, ...fixerKeys.slice(1)]);
    const { id } = await w.bugs.create(bee, report());
    expect((await w.bugs.update(admin, id, { assignee_key: `anga_two:${DEV_ALPHA.employeeId}` })).bug.assignee).toEqual({ key: `anga_two:${DEV_ALPHA.employeeId}`, name: "RenamedDev Changed" });
    await expect(w.bugs.update(admin, id, { assignee_key: `anga_two:${ADMIN_ID}` })).rejects.toSatisfy(fails(400));
    await expect(w.bugs.assignees(bee)).rejects.toSatisfy(fails(403));
  });

  test("a bug fixer sees every report and triages it like an admin, without being an A10 admin", async () => {
    const w = world();
    const { id } = await w.bugs.create(bee, report({ summary: "Board is blank" }));
    w.clock.now += 11_000;
    await w.bugs.create(cat, report({ summary: "Chat freezes" }));
    expect((await w.bugs.list(developer)).items.map((b) => b.summary)).toEqual(["Chat freezes", "Board is blank"]);
    expect(await w.bugs.counts(developer)).toEqual({ new_count: 2, unread_count: 0 });
    expect((await w.bugs.detail(developer, id)).can_triage).toBe(true);
    const d = await w.bugs.update(developer, id, { status: "in_progress", assignee_key: `anga_two:${DEV_BETA.employeeId}` });
    expect(d.bug).toMatchObject({ status: "in_progress", assignee: { name: "Developer Beta" } });
    expect(await w.bugs.openPage(developer, id)).toMatchObject({ isAdmin: true, assignees: fixerKeys, detail: { bug: { id } } });
  });

  test("a new report goes to Google Chat when the webhook is set, and a Chat failure never fails the report", async () => {
    const sent: string[] = [];
    const w = world({ chat: async (text) => void sent.push(text) });
    const { id } = await w.bugs.create(bee, report());
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/New bug report\* from Bee/);
    expect(sent[0]).toContain(`Open: https://a10.example.com/bugs/${id}`);
    const quiet = world();
    await quiet.bugs.create(bee, report());
    expect(quiet.bugReports).toHaveLength(1);
    expect(newBugText({ summary: "S", page_url: "P", description: null }, null, null)).toBe("*New bug report* from someone\nS\nPage: P");
  });

  test("before the migration is applied every call says BUGS_NOT_SET_UP, and nothing is stored", async () => {
    const w = world({ notSetUp: true });
    await expect(w.bugs.counts(bee)).rejects.toBeInstanceOf(BugsNotSetUpError);
    await expect(w.bugs.list(admin)).rejects.toBeInstanceOf(BugsNotSetUpError);
    await expect(w.bugs.detail(admin, MISSING_ID)).rejects.toBeInstanceOf(BugsNotSetUpError);
    await expect(w.bugs.create(bee, report())).rejects.toBeInstanceOf(BugsNotSetUpError);
    await expect(w.bugs.assignees(admin)).rejects.toBeInstanceOf(BugsNotSetUpError);
    expect(w.objects.size).toBe(0);
    expect(await w.bugs.openPage(admin, null)).toEqual({ state: "not-set-up", message: "Bug reports are not set up yet: the database migration is not applied." });
  });

  test("the page opens a report the viewer may see, and none they may not", async () => {
    const w = world();
    const { id } = await w.bugs.create(bee, report());
    const mine = await w.bugs.openPage(bee, id);
    expect(mine).toMatchObject({ state: "ready", isAdmin: false, assignees: [], detail: { bug: { id } } });
    expect(await w.bugs.openPage(cat, id)).toMatchObject({ state: "ready", detail: null, page: { items: [] } });
    expect(await w.bugs.openPage(admin, id)).toMatchObject({ isAdmin: true, assignees: fixerKeys, page: { items: [{ id }] } });
  });

  test("rate limiter, validators and cursors", () => {
    let now = 0;
    const limiter = createRateLimiter({ windowMs: 10_000, clock: () => now });
    expect(limiter.check("a")).toBe("allow");
    now = 9_999;
    expect(limiter.check("a")).toBe("block");
    expect(limiter.check("b")).toBe("allow");
    now = 10_000;
    expect(limiter.check("a")).toBe("allow");
    expect(bugReportMeta.parse(meta({ description: "  " })).description).toBeNull();
    expect(bugReportMeta.safeParse(meta({ device_type: "watch" })).success).toBe(false);
    expect(bugReportMeta.safeParse(meta({ summary: "x".repeat(201) })).success).toBe(false);
    const row = { created_at: "2026-10-22T03:00:00.123456+00:00", id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001" };
    expect(decodeCursor(encodeCursor(row))).toEqual({ at: row.created_at, id: row.id });
    expect(() => decodeCursor("bm9wZQ")).toThrow(BugError);
    expect(decodeCursor(null)).toBeNull();
  });
});

describe("bug storage", () => {
  test("the private bucket path with the service key; a missing bucket reads as not set up", async () => {
    const seen: { method: string; auth: string | null; type: string | null }[] = [];
    let answer: Response = Response.json({ Key: "ok" });
    const fake = createFakeDb({
      "/storage/v1/object/a10-bug-reports/bug-reports/x/screenshot.png": (_url, request) => {
        seen.push({ method: request.method, auth: request.headers.get("authorization"), type: request.headers.get("content-type") });
        return answer;
      },
    });
    const storage = createBugStorage(fake.db);
    await storage.put("bug-reports/x/screenshot.png", PNG, "image/png");
    expect(seen[0]).toEqual({ method: "POST", auth: "Bearer fake-service-role-key", type: "image/png" });
    answer = Response.json({ statusCode: "404", error: "Bucket not found", message: "Bucket not found" }, { status: 400 });
    await expect(storage.put("bug-reports/x/screenshot.png", PNG, "image/png")).rejects.toBeInstanceOf(BugsNotSetUpError);
    answer = new Response(PNG as Uint8Array<ArrayBuffer>, { headers: { "Content-Type": "image/png" } });
    expect(await storage.get("bug-reports/x/screenshot.png")).toEqual(PNG);
    answer = Response.json({ statusCode: "404", error: "not_found", message: "Object not found" }, { status: 400 });
    expect(await storage.get("bug-reports/x/screenshot.png")).toBeNull();
  });
});


test("developer inbox filters by the authenticated assignee, combines filters and pages, and follows reassignment", async () => {
  const w = world();
  const first = await w.bugs.create(bee, report({ summary: "Lead form fails" }));
  w.clock.now += 11_000;
  const otherBug = await w.bugs.create(bee, report({ summary: "Other developer bug" }));
  const reported = await w.bugs.create(developer, report({ summary: "Reported by developer, unassigned" }));
  w.clock.now += 11_000;
  const second = await w.bugs.create(bee, report({ summary: "Lead status wrong" }));
  await w.bugs.update(admin, first.id, { assignee_key: `anga_two:${DEV_ALPHA.employeeId}`, status: "in_progress", priority: "high" });
  await w.bugs.update(admin, otherBug.id, { assignee_key: `anga_two:${DEV_BETA.employeeId}` });
  await w.bugs.update(admin, second.id, { assignee_key: `anga_two:${DEV_ALPHA.employeeId}`, priority: "low" });
  const filters = { assigned_to_me: true, limit: 1 };
  const page = await w.bugs.list(developer, filters);
  expect(page.items.map(bug => bug.id)).toEqual([second.id]);
  expect(page.next_cursor).not.toBeNull();
  expect((await w.bugs.list(developer, { ...filters, cursor: page.next_cursor })).items.map(bug => bug.id)).toEqual([first.id]);
  expect((await w.bugs.list(developer, { assigned_to_me: true, status: "in_progress", priority: "high", q: "Lead" })).items.map(bug => bug.id)).toEqual([first.id]);
  expect((await w.bugs.list(developer, { mine: true })).items.map(bug => bug.id)).toEqual([reported.id]);
  await w.bugs.update(admin, first.id, { assignee_key: `anga_two:${DEV_BETA.employeeId}` });
  expect((await w.bugs.list(developer, { assigned_to_me: true })).items.map(bug => bug.id)).toEqual([second.id]);
  expect((await w.bugs.detail(developer, second.id)).can_triage).toBe(true);
});

test("developer first page opens assigned bugs; admins keep all and reporters keep their own", async () => {
  const w = world();
  const own = await w.bugs.create(bee, report({ summary: "Assigned to developer" }));
  const unassigned = await w.bugs.create(cat, report({ summary: "Unassigned" }));
  await w.bugs.update(admin, own.id, { assignee_key: `anga_two:${DEV_ALPHA.employeeId}` });
  expect(await w.bugs.openPage(developer, unassigned.id)).toMatchObject({ state: "ready", initialScope: "assigned", page: { items: [{ id: own.id }] }, detail: { bug: { id: unassigned.id } } });
  expect(await w.bugs.openPage(admin, null)).toMatchObject({ state: "ready", initialScope: "all", page: { items: [{ id: unassigned.id }, { id: own.id }] } });
  expect(await w.bugs.openPage(bee, null)).toMatchObject({ state: "ready", initialScope: "reported", page: { items: [{ id: own.id }] } });
});

test("assigned filters never expand ordinary reporter access or accept another person's assignee key", async () => {
  const w = world();
  const otherBug = await w.bugs.create(cat, report());
  Object.assign(w.bugReports.find(bug => bug.id === otherBug.id)!, { assignee_key: `anga_two:${BEE_ID}` });
  expect((await w.bugs.list(bee, { assigned_to_me: true })).items).toEqual([]);
  expect(bugListBody.parse({ assigned_to_me: true, assignee_key: `anga_two:${DEV_BETA.employeeId}` })).toEqual({ assigned_to_me: true });
  expect(bugListBody.safeParse({ assigned_to_me: "true" }).success).toBe(false);
});
