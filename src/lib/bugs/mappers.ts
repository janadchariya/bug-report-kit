/**
 * Map Prisma BugReport rows (UPPERCASE enums, Date) to domain types
 * (lowercase enums, ISO strings). Mirrors lib/store/mappers.ts pattern.
 */
import type {
  BugReport as PrismaBugReport,
  BugReportComment as PrismaBugComment,
  BugReportStatusChange as PrismaBugStatusChange,
} from "@/lib/generated/prisma/client";
import type {
  BugStatus as PrismaBugStatus,
  BugPriority as PrismaBugPriority,
} from "@/lib/generated/prisma/enums";

import type {
  BugDeviceType,
  BugPriority,
  BugReport,
  BugReportComment,
  BugReportStatusChange,
  BugStatus,
} from "./types";

const STATUS_TO_DOMAIN: Record<PrismaBugStatus, BugStatus> = {
  NEW: "new",
  IN_PROGRESS: "in_progress",
  DONE: "done",
  CANCELLED: "cancelled",
};

const STATUS_TO_PRISMA: Record<BugStatus, PrismaBugStatus> = {
  new: "NEW",
  in_progress: "IN_PROGRESS",
  done: "DONE",
  cancelled: "CANCELLED",
};

const PRIORITY_TO_DOMAIN: Record<PrismaBugPriority, BugPriority> = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

const PRIORITY_TO_PRISMA: Record<BugPriority, PrismaBugPriority> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  critical: "CRITICAL",
};

export function bugStatusToDomain(s: PrismaBugStatus): BugStatus {
  return STATUS_TO_DOMAIN[s];
}

export function bugStatusToPrisma(s: BugStatus): PrismaBugStatus {
  return STATUS_TO_PRISMA[s];
}

export function bugPriorityToDomain(p: PrismaBugPriority): BugPriority {
  return PRIORITY_TO_DOMAIN[p];
}

export function bugPriorityToPrisma(p: BugPriority): PrismaBugPriority {
  return PRIORITY_TO_PRISMA[p];
}

function asDeviceType(s: string | null): BugDeviceType | null {
  if (s === "desktop" || s === "tablet" || s === "mobile") return s;
  return null;
}

export function mapBugReport(row: PrismaBugReport): BugReport {
  return {
    id: row.id,
    companyId: row.companyId,
    reporterId: row.reporterId,
    summary: row.summary,
    description: row.description,
    screenshotPath: row.screenshotPath,
    screenshotWidth: row.screenshotWidth,
    screenshotHeight: row.screenshotHeight,
    pageUrl: row.pageUrl,
    viewportWidth: row.viewportWidth,
    viewportHeight: row.viewportHeight,
    userAgent: row.userAgent,
    osName: row.osName,
    osVersion: row.osVersion,
    browserName: row.browserName,
    browserVersion: row.browserVersion,
    deviceType: asDeviceType(row.deviceType),
    appBuildSha: row.appBuildSha,
    status: bugStatusToDomain(row.status),
    priority: row.priority ? bugPriorityToDomain(row.priority) : null,
    assignedToId: row.assignedToId,
    reporterLastReadAt: row.reporterLastReadAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapBugComment(row: PrismaBugComment): BugReportComment {
  return {
    id: row.id,
    bugReportId: row.bugReportId,
    authorId: row.authorId,
    body: row.body,
    imageUrl: row.imageUrl ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapBugStatusChange(
  row: PrismaBugStatusChange,
): BugReportStatusChange {
  return {
    id: row.id,
    bugReportId: row.bugReportId,
    changedById: row.changedById,
    fromStatus: row.fromStatus ? bugStatusToDomain(row.fromStatus) : null,
    toStatus: bugStatusToDomain(row.toStatus),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}
