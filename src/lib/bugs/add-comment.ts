import { prisma } from "@/lib/db/prisma";

import { mapBugComment } from "./mappers";
import type { BugReportComment } from "./types";

export async function addBugComment(opts: {
  bugReportId: string;
  authorId: string;
  body: string;
  imageUrl?: string | null;
}): Promise<BugReportComment> {
  const body = opts.body.trim();
  if (!body) throw new Error("Cannot add comment: body is required");
  const row = await prisma.bugReportComment.create({
    data: {
      bugReportId: opts.bugReportId,
      authorId: opts.authorId,
      body,
      ...(opts.imageUrl ? { imageUrl: opts.imageUrl } : {}),
    },
  });
  return mapBugComment(row);
}
