import { vi } from "vitest";
vi.mock("@/domain/bug-fixers", () => import("@/../tests/bug-fixers.fixture"));
import { describe, expect, test } from "vitest";
import {
  actorKey,
  badgeCount,
  bugPath,
  groupByStatus,
  hasUnreadReply,
  parseBugSegments,
  relativeTime,
  searchText,
  statusChangeOf,
  triageChange,
} from "./bug-reports";

const ME = actorKey("22222222-2222-4222-8222-222222222222");
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";

describe("bug report rules", () => {
  test("addresses are paths: /bugs and /bugs/<id>", () => {
    expect(bugPath()).toBe("/bugs");
    expect(bugPath(ID)).toBe(`/bugs/${ID}`);
    expect(parseBugSegments([])).toBeNull();
    expect(parseBugSegments([ID])).toBe(ID);
    expect(parseBugSegments(["nope"])).toBeUndefined();
    expect(parseBugSegments([ID, "x"])).toBeUndefined();
  });

  test("an unread reply is a reply after the reporter last opened the report, and only the reporter sees it", () => {
    const row = { reporter_key: ME, last_reply_at: "2026-10-22T04:00:00Z", reporter_last_read_at: null as string | null };
    expect(hasUnreadReply(row, ME)).toBe(true);
    expect(hasUnreadReply({ ...row, reporter_last_read_at: "2026-10-22T05:00:00Z" }, ME)).toBe(false);
    expect(hasUnreadReply({ ...row, reporter_last_read_at: "2026-10-22T03:00:00Z" }, ME)).toBe(true);
    expect(hasUnreadReply({ ...row, last_reply_at: null }, ME)).toBe(false);
    expect(hasUnreadReply(row, actorKey("someone-else"))).toBe(false);
    expect(badgeCount({ new_count: 2, unread_count: 1 })).toBe(3);
  });

  test("a status change adds a history row with the trimmed note; the same status adds none", () => {
    expect(statusChangeOf("new", "in_progress", "  looking ")).toEqual({ from_status: "new", to_status: "in_progress", note: "looking" });
    expect(statusChangeOf("new", "done", "   ")).toEqual({ from_status: "new", to_status: "done", note: null });
    expect(statusChangeOf("new", "new", "note")).toBeNull();
    expect(statusChangeOf("new", undefined, null)).toBeNull();
  });

  test("the triage form sends only what changed, with the note only beside a status move", () => {
    const bug = { status: "new" as const, priority: null, assignee: null };
    expect(triageChange(bug, { status: "in_progress", priority: "critical", assignee: "anga_two:a", note: " Reproduced " })).toEqual({
      status: "in_progress",
      note: "Reproduced",
      priority: "critical",
      assignee_key: "anga_two:a",
    });
    expect(triageChange(bug, { status: "new", priority: "", assignee: "", note: "ignored" })).toEqual({});
    const set = { status: "done" as const, priority: "high" as const, assignee: { key: "anga_two:a", name: "A" } };
    expect(triageChange(set, { status: "done", priority: "", assignee: "", note: "" })).toEqual({ priority: null, assignee_key: null });
  });

  test("the list groups by status in workflow order and leaves empty groups out", () => {
    const groups = groupByStatus([{ status: "done" as const }, { status: "new" as const }, { status: "done" as const }]);
    expect(groups.map(([status, rows]) => [status, rows.length])).toEqual([["new", 1], ["done", 2]]);
  });

  test("search text drops PostgREST's reserved characters and wildcards", () => {
    expect(searchText(" board*,(x)%_ ")).toBe("board   x");
    expect(searchText(null)).toBe("");
  });

  test("formats relative times", () => {
    const now = Date.parse("2026-10-22T10:00:00Z");
    expect(relativeTime("2026-10-22T09:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-10-22T09:15:00Z", now)).toBe("45 min");
    expect(relativeTime("2026-10-22T04:00:00Z", now)).toBe("6 h");
    expect(relativeTime("2026-10-19T10:00:00Z", now)).toBe("3 d");
    expect(relativeTime("2026-09-01T10:00:00Z", now)).toMatch(/^1 Sep/);
  });
});
