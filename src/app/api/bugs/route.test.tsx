import { beforeEach, expect, it, vi } from "vitest";
import { requireActor } from "@/src/server/auth/guard";
import { listBugs } from "@/src/server/bugs/queries";
import { AuthenticationError, AuthorizationError, DomainRuleError } from "@/src/server/errors";
import { logger } from "@/src/server/logging/logger";

vi.mock("@/src/server/auth/guard", () => ({ requireActor: vi.fn() }));
vi.mock("@/src/server/bugs/queries", () => ({ listBugs: vi.fn() }));
vi.mock("@/src/server/db/client", () => ({ db: {} }));
vi.mock("@/src/server/logging/logger", () => ({ logger: { error: vi.fn() } }));

const actor = { userId: "11111111-1111-4111-8111-111111111111" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireActor).mockResolvedValue(actor as never);
  vi.mocked(listBugs).mockResolvedValue({ items: [], nextCursor: null });
});
async function read(query = "") {
  const { GET } = await import("./route");
  return GET(new Request(`https://crm.test/api/bugs${query}`));
}

it("loads the filtered triage page after authentication with private cache headers", async () => {
  const response = await read("?status=new&priority=high&assignee=unassigned&q=Save&cursor=opaque");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [], nextCursor: null });
  expect(listBugs).toHaveBeenCalledWith({}, { actor, scope: "triage", status: "new", priority: "high", assigneeId: null, q: "Save", cursor: "opaque" });
  expect(vi.mocked(requireActor).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(listBugs).mock.invocationCallOrder[0]);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("location")).toBeNull();
});

it("refuses unauthenticated pagination without reading reports even with an invalid query", async () => {
  vi.mocked(requireActor).mockRejectedValue(new AuthenticationError("missing_session"));
  const response = await read("?q=one&q=two");
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthenticated" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(listBugs).not.toHaveBeenCalled();
});

it.each([new AuthorizationError("revoked"), new DomainRuleError("bug_not_visible")])(
  "keeps missing and denied queue access indistinguishable", async (error) => {
    vi.mocked(listBugs).mockRejectedValue(error);
    const response = await read();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(logger.error).not.toHaveBeenCalled();
  },
);

it.each(["?status=new&status=done", "?q=one&q=two", `?q=${"a".repeat(101)}`, "?assignee=invalid"])(
  "rejects invalid query values before the list service: %s", async (query) => {
    const response = await read(query);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_filter" });
    expect(requireActor).toHaveBeenCalledOnce();
    expect(listBugs).not.toHaveBeenCalled();
  },
);

it("rejects an invalid opaque cursor without treating the request as an internal failure", async () => {
  vi.mocked(listBugs).mockRejectedValue(new DomainRuleError("invalid_bug_cursor"));
  const response = await read("?cursor=opaque");
  expect(response.status).toBe(400);
  expect(logger.error).not.toHaveBeenCalled();
});

it("never serializes private error text when pagination fails unexpectedly", async () => {
  vi.mocked(listBugs).mockRejectedValue(new TypeError("private@example.test"));
  const response = await read();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "unavailable" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain("private@example.test");
});

it("loads Mine pagination through the reporter-scoped service", async () => {
  const response = await read("?cursor=older&scope=mine");
  expect(response.status).toBe(200);
  expect(listBugs).toHaveBeenCalledWith({}, { actor, scope: "mine", cursor: "older" });
});
it.each(["?scope=invalid", "?scope=mine&scope=triage"])("refuses invalid list scope %s", async (query) => {
  expect((await read(query)).status).toBe(400);
  expect(listBugs).not.toHaveBeenCalled();
});
