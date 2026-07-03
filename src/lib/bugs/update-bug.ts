import { prisma } from "@/lib/db/prisma";

import {
  bugPriorityToPrisma,
  bugStatusToPrisma,
  mapBugReport,
} from "./mappers";
import type { BugPriority, BugReport, BugStatus } from "./types";

export type UpdateBugPatch = {
  status?: BugStatus;
  priority?: BugPriority | null;
  assignedToId?: string | null;
};

export type UpdateBugOpts = {
  id: string;
  changedById: string;
  patch: UpdateBugPatch;
  note?: string;
};

/**
 * Apply admin patch and, when `status` actually changes, append an audit
 * row to `bug_report_status_changes`. All in a single Prisma transaction
 * so the update and audit row stay consistent.
 */
export async function updateBug(opts: UpdateBugOpts): Promise<BugReport> {
  const current = await prisma.bugReport.findUnique({
    where: { id: opts.id },
    select: { status: true },
  });
  if (!current) throw new Error(`Bug ${opts.id} not found`);

  const newStatusPrisma = opts.patch.status
    ? bugStatusToPrisma(opts.patch.status)
    : undefined;
  const statusChanged =
    newStatusPrisma !== undefined && newStatusPrisma !== current.status;

  const data: Record<string, unknown> = {};
  if (opts.patch.status !== undefined) data.status = newStatusPrisma;
  if (opts.patch.priority !== undefined) {
    data.priority =
      opts.patch.priority === null ? null : bugPriorityToPrisma(opts.patch.priority);
  }
  if (opts.patch.assignedToId !== undefined) {
    data.assignedToId = opts.patch.assignedToId;
  }

  const [updated] = await prisma.$transaction([
    prisma.bugReport.update({ where: { id: opts.id }, data }),
    ...(statusChanged && newStatusPrisma
      ? [
          prisma.bugReportStatusChange.create({
            data: {
              bugReportId: opts.id,
              changedById: opts.changedById,
              fromStatus: current.status,
              toStatus: newStatusPrisma,
              note: opts.note?.trim() || null,
            },
          }),
        ]
      : []),
  ]);

  return mapBugReport(updated);
}
