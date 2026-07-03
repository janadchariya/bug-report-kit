/**
 * Domain types for bug reports. Use lowercase enum strings consistent with
 * the rest of the store layer (see lib/store/types.ts). The mapper in
 * lib/bugs/mappers.ts translates these to/from Prisma's UPPERCASE enums.
 */

export type BugStatus = "new" | "in_progress" | "done" | "cancelled";

export type BugPriority = "low" | "medium" | "high" | "critical";

export type BugDeviceType = "desktop" | "tablet" | "mobile";

export type BugReport = {
  id: string;
  companyId: string;
  reporterId: string;

  summary: string;
  description: string | null;

  screenshotPath: string;
  screenshotWidth: number;
  screenshotHeight: number;

  pageUrl: string;
  viewportWidth: number;
  viewportHeight: number;
  userAgent: string;
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  browserVersion: string | null;
  deviceType: BugDeviceType | null;
  appBuildSha: string | null;

  status: BugStatus;
  priority: BugPriority | null;
  assignedToId: string | null;

  reporterLastReadAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BugReportComment = {
  id: string;
  bugReportId: string;
  authorId: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
};

export type BugReportStatusChange = {
  id: string;
  bugReportId: string;
  changedById: string;
  fromStatus: BugStatus | null;
  toStatus: BugStatus;
  note: string | null;
  createdAt: string;
};

export type BugListItem = BugReport & {
  reporter: { id: string; fullName: string; email: string; companyId: string };
  company: { id: string; name: string };
};
