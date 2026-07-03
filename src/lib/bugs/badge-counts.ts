/**
 * Sidebar badge counts. In the source project these lived in the monolithic
 * lib/store/repository.ts — extracted here as a standalone module.
 *
 * - countNewBugs(): shown to ADMIN next to the "Bug Reports" nav item.
 * - countUnreadBugReplies(userId): shown to every user next to "My Bugs" —
 *   counts bugs they reported that got a reply from someone else after
 *   reporterLastReadAt (cleared by POST /api/bugs/[id]/reporter-read).
 */
import { prisma } from "@/lib/db/prisma";

export async function countNewBugs(): Promise<number> {
  return prisma.bugReport.count({ where: { status: "NEW" } });
}

export async function countUnreadBugReplies(userId: string): Promise<number> {
  // Count bugs reported by this user that have at least one comment
  // from someone else created after the user last read the bug.
  const bugs = await prisma.bugReport.findMany({
    where: { reporterId: userId, status: { notIn: ["DONE", "CANCELLED"] } },
    select: {
      reporterLastReadAt: true,
      comments: {
        where: { authorId: { not: userId } },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  let count = 0;
  for (const bug of bugs) {
    const lastReply = bug.comments[0];
    if (!lastReply) continue;
    if (!bug.reporterLastReadAt || lastReply.createdAt > bug.reporterLastReadAt) {
      count++;
    }
  }
  return count;
}
