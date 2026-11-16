import { beforeEach, expect, test, vi } from "vitest";
import type { EmployeeId, PersonId } from "@/domain/model";
import { getSession } from "@/server/auth/get-viewer";
import { getBugReports, type BugReports } from "@/server/bugs/bug-reports";
import { BugError } from "@/server/bugs/errors";
import { BugsNotSetUpError } from "@/server/db/bug-queries";
import { writesEnabled } from "@/server/writes/wiring";
import { GET as counts } from "./counts/route";
import { POST as update } from "./[bugId]/update/route";
import { GET as screenshot } from "./[bugId]/screenshot/route";
import { POST as create } from "./route";
import { POST as search } from "./search/route";

vi.mock("@/server/auth/get-viewer", () => ({ getSession: vi.fn(), publicOrigin: () => null }));
vi.mock("@/server/bugs/bug-reports", () => ({ getBugReports: vi.fn() }));
vi.mock("@/server/writes/wiring", () => ({ writesEnabled: vi.fn() }));

const ORIGIN = "http://127.0.0.1:3401";
const BUG = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const viewer = { employeeId: "22222222-2222-4222-8222-222222222222" as EmployeeId, clickUpId: "90000002" as PersonId };
const session = { viewer, csrf: "c".repeat(48), source: "anga_two" as const };
const service = {
  create: vi.fn(async () => ({ id: BUG })),
  counts: vi.fn(async () => ({ new_count: 1, unread_count: 2 })),
  list: vi.fn(async () => ({ items: [], next_cursor: null })),
  update: vi.fn(),
  screenshot: vi.fn(async () => ({ bytes: Uint8Array.from([137, 80, 78, 71]), mime: "image/png" })),
};
// Next gives a route without dynamic segments no params.
const params = (value?: Record<string, string>) => (value ? { params: Promise.resolve(value) } : {});
const headers = { origin: ORIGIN, "x-a10-csrf": session.csrf };
const json = (path: string, body: unknown, extra: Record<string, string> = headers) =>
  new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
const form = () => {
  const data = new FormData();
  data.set("meta", JSON.stringify({ summary: "Broken" }));
  data.set("file", new Blob([Uint8Array.from([137, 80, 78, 71])], { type: "image/png" }), "screenshot.png");
  return new Request(`${ORIGIN}/api/bugs`, { method: "POST", headers, body: data });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(session);
  vi.mocked(getBugReports).mockReturnValue(service as unknown as BugReports);
  vi.mocked(writesEnabled).mockReturnValue(true);
});

test("401 without a session, and the service is never called", async () => {
  vi.mocked(getSession).mockResolvedValue(null);
  const response = await counts(new Request(`${ORIGIN}/api/bugs/counts`), params());
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: "LOGIN_REQUIRED" });
  expect(service.counts).not.toHaveBeenCalled();
});

test("a report is one multipart request: 201 {id}, with the text fields and the file handed to the service", async () => {
  const response = await create(form(), params());
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ id: BUG });
  const [who, upload] = service.create.mock.calls[0] as unknown as [unknown, { fields: Record<string, string>; files: { field: string; file: Blob }[] }];
  expect(who).toEqual(viewer);
  expect(upload.fields).toEqual({ meta: JSON.stringify({ summary: "Broken" }) });
  expect(upload.files.map((f) => [f.field, f.file.size])).toEqual([["file", 4]]);
});

test("writes need the site's Origin and the CSRF token, and A10_WRITES_ENABLED", async () => {
  const foreign = await update(json(`/api/bugs/${BUG}/update`, { status: "done" }, { origin: "https://evil.test", "x-a10-csrf": session.csrf }), params({ bugId: BUG }));
  expect(foreign.status).toBe(403);
  const noToken = await update(json(`/api/bugs/${BUG}/update`, { status: "done" }, { origin: ORIGIN }), params({ bugId: BUG }));
  expect(noToken.status).toBe(403);
  vi.mocked(writesEnabled).mockReturnValue(false);
  const off = await create(form(), params());
  expect(off.status).toBe(503);
  expect(await off.json()).toMatchObject({ code: "WRITES_DISABLED" });
  expect(service.create).not.toHaveBeenCalled();
  expect(service.update).not.toHaveBeenCalled();
});

test("bad ids and bodies are 400; an upload over the size limit is 413 before it is read", async () => {
  expect((await update(json("/api/bugs/x/update", { status: "done" }), params({ bugId: "x" }))).status).toBe(400);
  expect((await update(json(`/api/bugs/${BUG}/update`, { status: "closed" }), params({ bugId: BUG }))).status).toBe(400);
  const big = new Request(`${ORIGIN}/api/bugs`, { method: "POST", headers: { ...headers, "content-type": "multipart/form-data; boundary=x", "content-length": String(5 * 1024 * 1024) }, body: "x" });
  const response = await create(big, params());
  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({ code: "FILE_TOO_LARGE" });
  expect(service.create).not.toHaveBeenCalled();
});

test("before the migration is applied the routes answer 503 BUGS_NOT_SET_UP; service refusals keep their status and code", async () => {
  service.counts.mockRejectedValueOnce(new BugsNotSetUpError());
  const response = await counts(new Request(`${ORIGIN}/api/bugs/counts`), params());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Bug reports are not set up yet: the database migration is not applied.", code: "BUGS_NOT_SET_UP", retryable: false });
  service.create.mockRejectedValueOnce(new BugError(429, "RATE_LIMITED", "Please wait", true));
  const limited = await create(form(), params());
  expect(limited.status).toBe(429);
  expect(await limited.json()).toEqual({ error: "Please wait", code: "RATE_LIMITED", retryable: true });
});

test("the list filters travel in a JSON body and work while writes are off", async () => {
  vi.mocked(writesEnabled).mockReturnValue(false);
  const response = await search(json("/api/bugs/search", { status: "new", q: "board", mine: true }), params());
  expect(response.status).toBe(200);
  expect(service.list).toHaveBeenCalledWith(viewer, { status: "new", q: "board", mine: true });
  expect((await search(json("/api/bugs/search", { status: "open" }), params())).status).toBe(400);
});

test("the list needs no CSRF token (the browser sends none for reads), but stays same-site only", async () => {
  const noToken = await search(json("/api/bugs/search", { status: "new" }, { origin: ORIGIN }), params());
  expect(noToken.status).toBe(200);
  const crossSite = await search(json("/api/bugs/search", { status: "new" }, { origin: "https://evil.example" }), params());
  expect(crossSite.status).toBe(403);
  expect(await crossSite.json()).toMatchObject({ code: "REQUEST_REFUSED" });
});

test("a screenshot is served sandboxed and never sniffed", async () => {
  const response = await screenshot(new Request(`${ORIGIN}/api/bugs/${BUG}/screenshot`), params({ bugId: BUG }));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(service.screenshot).toHaveBeenCalledWith(viewer, BUG);
});
