import { BUG_IMAGE_MAX_BYTES, BUG_IMAGE_MAX_EDGE, BUG_LIMITS, BUG_PRIORITIES, BUG_STATUSES, canTransitionBugStatus, validateBugReason } from "./bugs";

it("defines bounded bug inputs and finite workflow values", () => {
  expect(BUG_STATUSES).toEqual(["new", "in_progress", "done", "cancelled"]);
  expect(BUG_PRIORITIES).toEqual(["low", "medium", "high", "critical"]);
  expect(BUG_IMAGE_MAX_BYTES).toBe(2_097_152);
  expect(BUG_IMAGE_MAX_EDGE).toBe(1920);
  expect(BUG_LIMITS).toMatchObject({ summary: 200, description: 4000, comment: 4000, reason: 500, reportsPerWindow: 5, commentsPerWindow: 30, windowMs: 600_000 });
});

it("permits exactly the approved status transitions, excluding same-status saves", () => {
  const allowed = ["new:in_progress", "new:cancelled", "in_progress:done", "in_progress:cancelled", "done:in_progress", "cancelled:in_progress"];
  for (const from of BUG_STATUSES) for (const to of BUG_STATUSES) {
    expect(canTransitionBugStatus(from, to), `${from}:${to}`).toBe(allowed.includes(`${from}:${to}`));
  }
});

it("trims a required reason and refuses blank or overlong evidence", () => {
  expect(validateBugReason("  duplicate  ")).toBe("duplicate");
  expect(validateBugReason("ก".repeat(500))).toHaveLength(500);
  for (const reason of ["", " \n ", "ก".repeat(501)]) expect(() => validateBugReason(reason)).toThrow();
});
