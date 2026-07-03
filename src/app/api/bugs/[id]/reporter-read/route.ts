import type { NextRequest } from "next/server";

import { handleApiError, jsonError, jsonOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await ctx.params;

    const bug = await prisma.bugReport.findUnique({
      where: { id },
      select: { reporterId: true },
    });
    if (!bug) return jsonError("not_found", "Bug not found", 404);
    if (bug.reporterId !== user.id) {
      return jsonError("forbidden", "Only the reporter can mark as read", 403);
    }

    await prisma.bugReport.update({
      where: { id },
      data: { reporterLastReadAt: new Date() },
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
