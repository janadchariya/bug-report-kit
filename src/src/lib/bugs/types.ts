import type { BugPriority, BugStatus } from "@/src/domain/bugs";

export type BugImageMeta = {
  id: string;
  kind: "screenshot" | "comment";
  mimeType: string;
  width: number;
  height: number;
  byteCount: number;
  removed: boolean;
  url: string | null;
};

export type BugStaff = { id: string; displayName: string; nickname: string | null };
export type BugPdfMeta = {
  id: string;
  kind: 'report_pdf' | 'comment_pdf';
  mimeType: 'application/pdf';
  fileName: string;
  byteCount: number;
  removed: boolean;
  url: string | null;
};
export type BugListItem = {
  id: string;
  summary: string;
  /** Private image route identifier; removed screenshots are null. */
  screenshotImageId?: string | null;
  hasPdf?: boolean;
  status: BugStatus;
  priority: BugPriority | null;
  assigned: boolean;
  /** Triage scope only; Mine receives assignment state without staff identity. */
  assignedToUserId?: string | null;
  version: number;
  reporterActivitySeq: number;
  reporterReadSeq: number;
  unread: boolean;
  createdAt: string;
  updatedAt: string;
  reporter?: BugStaff;
  assignee?: (BugStaff & { available: boolean }) | null;
};

export type BugComment = {
  id: string;
  isMine: boolean;
  /** Triage scope only. Comment action results may include the actor's own ID. */
  authorUserId?: string;
  body: string | null;
  createdAt: string;
  image: BugImageMeta | null;
  pdf?: BugPdfMeta | null;
  /** A separately uploaded PDF is still awaited; body can legitimately be NULL. */
  pendingPdf?: boolean;
};
export type BugStatusChange = {
  id: string;
  isMine: boolean;
  /** Triage scope only. */
  changedByUserId?: string;
  fromStatus: BugStatus | null;
  toStatus: BugStatus;
  reason: string | null;
  createdAt: string;
};
export type BugDetail = BugListItem & {
  isOwner: boolean;
  /** Guarded triage projection only; Mine never exposes raw captured UA. */
  userAgent?: string;
  description: string | null;
  pagePath: string;
  pageQuery: string;
  viewportWidth: number;
  viewportHeight: number;
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  browserVersion: string | null;
  deviceType: string | null;
  appBuildSha: string | null;
  screenshot: BugImageMeta | null;
  pdf?: BugPdfMeta | null;
  comments: BugComment[];
  statusChanges: BugStatusChange[];
  commentsBefore: string | null;
  historyBefore: string | null;
  seenActivitySeq: number;
};
export type BugNavCounts = { bugNew: number; bugUnread: number };
