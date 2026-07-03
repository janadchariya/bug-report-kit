import { prisma } from "@/lib/db/prisma";
import type { UserRole } from "@/lib/store/types";

import { bugPriorityToPrisma, bugStatusToPrisma, mapBugReport } from "./mappers";
import type { BugListItem, BugPriority, BugReport, BugStatus } from "./types";

export type ListBugsViewer = {
  id: string;
  role: UserRole;
  companyId: string;
};

export type ListBugsOpts = {
  viewer: ListBugsViewer;
  status?: BugStatus;
  priority?: BugPriority;
  /** Admin-only: filter to a specific company. Ignored for non-admins. */
  companyId?: string;
  /** Substring match on summary (case-insensitive). */
  q?: string;
  /** Cursor = id of the last item in the previous page. */
  cursor?: string;
  /** Page size 1..100. Default 25. */
  limit?: number;
};

export type ListBugsPage = {
  items: BugReport[];
  nextCursor: string | null;
};

export async function listBugs(opts: ListBugsOpts): Promise<ListBugsPage> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);

  const where: Record<string, unknown> = {};
  if (opts.viewer.role !== "ADMIN") {
    // Non-admins can only see their own bugs.
    where.reporterId = opts.viewer.id;
  } else if (opts.companyId) {
    where.companyId = opts.companyId;
  }
  if (opts.status) where.status = bugStatusToPrisma(opts.status);
  if (opts.priority) where.priority = bugPriorityToPrisma(opts.priority);
  if (opts.q && opts.q.trim()) {
    where.summary = { contains: opts.q.trim(), mode: "insensitive" };
  }

  const rows = await prisma.bugReport.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(mapBugReport);
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  return { items, nextCursor };
}

export type ListBugsWithMetaPage = {
  items: BugListItem[];
  nextCursor: string | null;
};

export async function listBugsWithMeta(
  opts: ListBugsOpts,
): Promise<ListBugsWithMetaPage> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);

  const where: Record<string, unknown> = {};
  if (opts.viewer.role !== "ADMIN") {
    where.reporterId = opts.viewer.id;
  } else if (opts.companyId) {
    where.companyId = opts.companyId;
  }
  if (opts.status) where.status = bugStatusToPrisma(opts.status);
  if (opts.priority) where.priority = bugPriorityToPrisma(opts.priority);
  if (opts.q && opts.q.trim()) {
    where.summary = { contains: opts.q.trim(), mode: "insensitive" };
  }

  const rows = await prisma.bugReport.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: {
      reporter: { select: { id: true, fullName: true, email: true, companyId: true } },
      company: { select: { id: true, name: true } },
    },
  });

  const hasMore = rows.length > limit;
  const items: BugListItem[] = rows.slice(0, limit).map((r) => ({
    ...mapBugReport(r),
    reporter: r.reporter,
    company: r.company,
  }));
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
