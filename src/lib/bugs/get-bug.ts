import { prisma } from "@/lib/db/prisma";

import {
  mapBugComment,
  mapBugReport,
  mapBugStatusChange,
} from "./mappers";
import type {
  BugReport,
  BugReportComment,
  BugReportStatusChange,
} from "./types";

export type BugDetail = {
  bug: BugReport;
  comments: BugReportComment[];
  statusHistory: BugReportStatusChange[];
};

export async function getBugDetail(id: string): Promise<BugDetail | null> {
  const row = await prisma.bugReport.findUnique({
    where: { id },
    include: {
      comments: { orderBy: { createdAt: "asc" } },
      statusChanges: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) return null;
  return {
    bug: mapBugReport(row),
    comments: row.comments.map(mapBugComment),
    statusHistory: row.statusChanges.map(mapBugStatusChange),
  };
}

export async function getBugCompanyAndReporter(
  id: string,
): Promise<{ companyId: string; reporterId: string } | null> {
  const row = await prisma.bugReport.findUnique({
    where: { id },
    select: { companyId: true, reporterId: true },
  });
  if (!row) return null;
  return row;
}
