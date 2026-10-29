import { beforeEach, expect, it, vi } from "vitest";
import type { Actor } from "@/src/server/auth/actor";
import { listActiveBugTriagers } from "@/src/server/bugs/access";
import { getBugDetail, listBugs } from "@/src/server/bugs/queries";
import { DomainRuleError } from "@/src/server/errors";
import { loadBugsWorkspace } from "./load-workspace";

vi.mock("@/src/server/bugs/access", () => ({ listActiveBugTriagers: vi.fn() }));
vi.mock("@/src/server/bugs/queries", () => ({ getBugDetail: vi.fn(), listBugs: vi.fn() }));
vi.mock("@/src/server/db/client", () => ({ db: {} }));
vi.mock("@/src/components/bugs/bugs-workspace", () => ({ BugsWorkspace: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

const first = "11111111-1111-4111-8111-111111111111";
const selected = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "33333333-3333-4333-8333-333333333333" } as Actor;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listBugs).mockResolvedValue({ items: [{ id: first }] as never, nextCursor: null });
  vi.mocked(getBugDetail).mockImplementation(async (_db, input) => ({ id: input.bugId }) as never);
  vi.mocked(listActiveBugTriagers).mockResolvedValue([]);
});

it("opens the first filtered triage result when no report is selected", async () => {
  const result = await loadBugsWorkspace(actor, "triage", { status: "new", q: " Save " });
  expect(listBugs).toHaveBeenCalledWith({}, expect.objectContaining({ actor, scope: "triage", status: "new", q: "Save" }));
  expect(getBugDetail).toHaveBeenCalledWith({}, { actor, scope: "triage", bugId: first });
  expect(result.props.detail).toEqual({ id: first });
});

it("resolves an explicit selection through the scoped detail service even outside the filtered page", async () => {
  const result = await loadBugsWorkspace(actor, "triage", { selected, priority: "high" });
  expect(getBugDetail).toHaveBeenCalledWith({}, { actor, scope: "triage", bugId: selected });
  expect(result.props.detail).toEqual({ id: selected });
});

it("leaves an empty queue without a detail request", async () => {
  vi.mocked(listBugs).mockResolvedValue({ items: [], nextCursor: null });
  const result = await loadBugsWorkspace(actor, "triage", {});
  expect(getBugDetail).not.toHaveBeenCalled();
  expect(result.props.detail).toBeNull();
});

it("keeps the list and an in-pane error for a refused selection without falling back", async () => {
  vi.mocked(getBugDetail).mockRejectedValue(new DomainRuleError("bug_not_visible"));
  const result = await loadBugsWorkspace(actor, "triage", { selected });
  expect(result.props.items).toEqual([{ id: first }]);
  expect(result.props.detail).toBeNull();
  expect(result.props.detailError).toBeTruthy();
  expect(result.props.selectedId).toBe(selected);
  expect(getBugDetail).toHaveBeenCalledTimes(1);
});

it.each([{ q: "x".repeat(101) }, { q: ["one", "two"] }])(
  "refuses malformed search before querying reports: %j", async (query) => {
    await expect(loadBugsWorkspace(actor, "triage", query)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listBugs).not.toHaveBeenCalled();
    expect(getBugDetail).not.toHaveBeenCalled();
  },
);

it("keeps Mine as a list and never resolves a triage-style selection or staff lookup", async () => {
  const result = await loadBugsWorkspace(actor, "mine", { selected });
  expect(getBugDetail).not.toHaveBeenCalled();
  expect(listActiveBugTriagers).not.toHaveBeenCalled();
  expect(result.props.detail).toBeNull();
});

it("keeps nested Mine details scoped to the reporter regardless of query selection", async () => {
  const result = await loadBugsWorkspace(actor, "mine", { selected: first }, selected);
  expect(getBugDetail).toHaveBeenCalledWith({}, { actor, scope: "mine", bugId: selected });
  expect(listActiveBugTriagers).not.toHaveBeenCalled();
  expect(result.props.detail).toEqual({ id: selected });
});

it.each([{ selected: "invalid" }, { selected: [first, selected] }])("keeps the queue for an invalid selection: %j", async (query) => {
  const result = await loadBugsWorkspace(actor, "triage", query);
  expect(result.props.items).toEqual([{ id: first }]);
  expect(result.props.detail).toBeNull();
  expect(result.props.detailError).toBeTruthy();
  expect(getBugDetail).not.toHaveBeenCalled();
});
