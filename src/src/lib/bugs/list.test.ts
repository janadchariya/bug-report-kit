import { expect, it } from "vitest";
import { parseBugFilters, bugListUrl } from "@/app/(app)/bugs/filters";
const id = "11111111-1111-4111-8111-111111111111";
it("validates and preserves trimmed literal summary searches and triage selection in URLs", () => {
  expect(parseBugFilters({ q: "  Save_%\\failed  " })).toEqual({ q: "Save_%\\failed" });
  for (const q of ["x".repeat(101), ["one", "two"]]) expect(() => parseBugFilters({ q })).toThrow("invalid_bug_filter");
  expect(parseBugFilters({ q: "  " })).toEqual({});
  expect(bugListUrl("triage", { status: "new" }, id)).toBe(`/bugs?status=new&selected=${id}`);
  expect(bugListUrl("mine", {}, id)).toBe(`/bugs/mine/${id}`);
});
it("formats Thai relative times at minute, hour, day and week boundaries", async () => {
  const { formatBugRelativeTime, escapeBugSummarySearch } = await import("./list");
  const now = Date.parse("2026-10-28T04:00:00Z");
  const before = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  expect(formatBugRelativeTime(before(-1), now)).toBe("เมื่อกี้");
  expect(formatBugRelativeTime(before(0), now)).toBe("เมื่อกี้");
  expect(formatBugRelativeTime(before(5), now)).toBe("5 นาที");
  expect(formatBugRelativeTime(before(180), now)).toBe("3 ชม.");
  expect(formatBugRelativeTime(before(2 * 1440), now)).toBe("2 วัน");
  expect(formatBugRelativeTime(before(7 * 1440), now)).toBe(new Date(before(7 * 1440)).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" }));
  expect(escapeBugSummarySearch("50%_\\failed")).toBe("50\\%\\_\\\\failed");
});
