import { beforeEach, expect, it, vi } from "vitest";
import { requireActorOrRedirect } from "@/src/server/auth/guard";
import { listBugs, getBugDetail } from "@/src/server/bugs/queries";
import { listActiveBugTriagers } from "@/src/server/bugs/access";
import { DomainRuleError } from "@/src/server/errors";
import BugsPage from "./page";
import BugPage from "./[id]/page";
import MinePage from "./mine/page";
import MineDetailPage from "./mine/[id]/page";
import { parseBugFilters } from "./filters";

vi.mock("server-only", () => ({}));
vi.mock("@/src/server/auth/guard", () => ({ requireActorOrRedirect: vi.fn() }));
vi.mock("@/src/server/bugs/queries", () => ({ listBugs: vi.fn(), getBugDetail: vi.fn() }));
vi.mock("@/src/server/bugs/access", () => ({ listActiveBugTriagers: vi.fn() }));
vi.mock("@/src/server/db/client", () => ({ db: {} }));
vi.mock("@/src/components/bugs/bugs-workspace", () => ({ BugsWorkspace: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
const id = "11111111-1111-4111-8111-111111111111";
const actor = { userId: id };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireActorOrRedirect).mockResolvedValue(actor as never);
  vi.mocked(listBugs).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(getBugDetail).mockResolvedValue({ id, isOwner: true } as never);
  vi.mocked(listActiveBugTriagers).mockResolvedValue([]);
});
it.each([
  ["triage", "bugs.triage", BugsPage, undefined],
  ["mine", "bugs.report", MinePage, undefined],
  ["triage", "bugs.triage", BugPage, id],
  ["mine", "bugs.report", MineDetailPage, id],
] as const)("guards %s before all data access", async (scope, permission, Page, bugId) => {
  const result = Page({ params: Promise.resolve({ id: bugId ?? id }), searchParams: Promise.resolve({}) });
  if (Page === BugPage) await expect(result).rejects.toThrow(`NEXT_REDIRECT:/bugs?selected=${id}`);
  else await result;
  expect(requireActorOrRedirect).toHaveBeenCalledWith(permission);
  if (Page === BugPage) {
    expect(vi.mocked(requireActorOrRedirect).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(getBugDetail).mock.invocationCallOrder[0]);
    expect(listBugs).not.toHaveBeenCalled();
  } else {
    expect(vi.mocked(requireActorOrRedirect).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(listBugs).mock.invocationCallOrder[0]);
    expect(listBugs).toHaveBeenCalledWith({}, expect.objectContaining({ actor, scope }));
  }
  if (bugId) expect(getBugDetail).toHaveBeenCalledWith({}, { actor, scope, bugId });
  if (scope === "mine") expect(listActiveBugTriagers).not.toHaveBeenCalled();
});
it("does no reads when the guard refuses", async () => {
  vi.mocked(requireActorOrRedirect).mockRejectedValue(new Error("NEXT_NOT_FOUND"));
  await expect(MinePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  expect(listBugs).not.toHaveBeenCalled(); expect(getBugDetail).not.toHaveBeenCalled();
});
it("maps missing or foreign report detail to not found", async () => {
  vi.mocked(getBugDetail).mockRejectedValue(new DomainRuleError("bug_not_visible"));
  await expect(MineDetailPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
});
it("validates filters without passing unknown or repeated query values", () => {
  expect(parseBugFilters({})).toEqual({});
  expect(parseBugFilters({ status: "done", priority: "none", assignee: "unassigned", q: "private" })).toEqual({ status: "done", priority: null, assigneeId: null, q: "private" });
  expect(parseBugFilters({ assignee: id })).toEqual({ assigneeId: id });
  for (const value of [{ status: "bad" }, { priority: "bad" }, { assignee: "bad" }, { status: ["new", "done"] }]) {
    expect(() => parseBugFilters(value)).toThrow();
  }
});

it("redirects old triage links only after scoped access is checked and preserves filters", async () => {
  await expect(BugPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ status: "new", q: "Save" }) }))
    .rejects.toThrow(`NEXT_REDIRECT:/bugs?status=new&q=Save&selected=${id}`);
  expect(getBugDetail).toHaveBeenCalledWith({}, { actor, scope: "triage", bugId: id });
  vi.mocked(getBugDetail).mockRejectedValue(new DomainRuleError("bug_not_visible"));
  await expect(BugPage({ params: Promise.resolve({ id }) })).rejects.toThrow("NEXT_NOT_FOUND");
});
