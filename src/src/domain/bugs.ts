export const BUG_STATUSES = ["new", "in_progress", "done", "cancelled"] as const;
export const BUG_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type BugStatus = (typeof BUG_STATUSES)[number];
export type BugPriority = (typeof BUG_PRIORITIES)[number];

export const BUG_IMAGE_MAX_BYTES = 2_097_152;
export const BUG_IMAGE_MAX_EDGE = 1920;
export const BUG_LIMITS = {
  summary: 200, description: 4000, comment: 4000, reason: 500,
  userAgent: 2048, pagePath: 2048, pageQuery: 2048, viewport: 16_384,
  reportsPerWindow: 5, commentsPerWindow: 30, windowMs: 600_000,
  imageBytesPerWindow: 52_428_800, imageWindowMs: 86_400_000,
} as const;

const transitions: Readonly<Record<BugStatus, readonly BugStatus[]>> = {
  new: ["in_progress", "cancelled"], in_progress: ["done", "cancelled"],
  done: ["in_progress"], cancelled: ["in_progress"],
};

export function canTransitionBugStatus(from: BugStatus, to: BugStatus): boolean {
  return transitions[from].includes(to);
}

export function validateBugReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed || trimmed.length > BUG_LIMITS.reason) throw new Error("invalid_bug_reason");
  return trimmed;
}
