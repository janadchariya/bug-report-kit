import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, jsonError, jsonOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";

const Body = z.object({ imageUrl: z.string().min(1).max(500) });

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; cid: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id, cid } = await ctx.params;

    const comment = await prisma.bugReportComment.findUnique({
      where: { id: cid },
      select: { bugReportId: true, authorId: true },
    });
    if (!comment || comment.bugReportId !== id) {
      return jsonError("not_found", "Comment not found", 404);
    }
    if (comment.authorId !== user.id) {
      return jsonError("forbidden", "Only the author can set image", 403);
    }

    const { imageUrl } = Body.parse(await req.json());
    await prisma.bugReportComment.update({
      where: { id: cid },
      data: { imageUrl },
    });
    return jsonOk({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError("validation", "Invalid body", 400, { issues: err.issues });
    }
    return handleApiError(err);
  }
}
