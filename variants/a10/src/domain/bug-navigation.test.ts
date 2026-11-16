import { expect, test, vi } from "vitest";
vi.mock("@/domain/bug-fixers", () => import("@/../tests/bug-fixers.fixture"));
import { BUG_FIXERS } from "./bug-reports";
import { bugNavigation } from "./bug-navigation";

test("desktop and mobile share visibility: admin, lead or configured developer", () => {
  expect(bugNavigation({ isAdmin: false, isLead: false }, "reporter")).toBeNull();
  for (const [access, id] of [
    [{ isAdmin: true, isLead: false }, "admin"],
    [{ isAdmin: false, isLead: true }, "lead"],
    [{ isAdmin: false, isLead: false }, BUG_FIXERS[0].employeeId],
  ] as const) expect(bugNavigation(access, id)).toEqual({ href: "/bugs", label: "Bug reports" });
});

test("showing a Lead's menu does not grant triage", async () => {
  const { canTriageBugs } = await import("./bug-reports");
  expect(canTriageBugs({ isAdmin: false }, "lead")).toBe(false);
});
