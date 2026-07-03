import { prisma } from "@/lib/db/prisma";
import { mapBugReport } from "./mappers";
import type { BugReport } from "./types";

export type MyBugItem = BugReport & {
  hasUnreadReply: boolean;
};

export async function getMyBugs(opts: {
  userId: string;
  companyId: string;
}): Promise<MyBugItem[]> {
  const rows = await prisma.bugReport.findMany({
    where: { reporterId: opts.userId, companyId: opts.companyId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      comments: {
        where: { authorId: { not: opts.userId } },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return rows.map((row) => {
    const bug = mapBugReport(row);
    const lastAdminComment = row.comments[0];
    const hasUnreadReply =
      !!lastAdminComment &&
      (!row.reporterLastReadAt ||
        lastAdminComment.createdAt > row.reporterLastReadAt);
    return { ...bug, hasUnreadReply };
  });
}
