import { NextResponse } from "next/server";

import { handleApiError, jsonError } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { isValidCommentImagePath, readCommentImage } from "@/lib/bugs/storage";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; cid: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id, cid } = await ctx.params;

    const comment = await prisma.bugReportComment.findUnique({
      where: { id: cid },
      select: {
        bugReportId: true,
        imageUrl: true,
        bugReport: { select: { reporterId: true, companyId: true } },
      },
    });
    if (!comment || comment.bugReportId !== id) {
      return jsonError("not_found", "Comment not found", 404);
    }
    if (!comment.imageUrl) {
      return jsonError("not_found", "No image for this comment", 404);
    }

    const isOwner = comment.bugReport.reporterId === user.id;
    if (!isOwner && user.role !== "ADMIN") {
      return jsonError("forbidden", "Cannot view this image", 403);
    }

    if (
      !isValidCommentImagePath(comment.imageUrl, {
        companyId: comment.bugReport.companyId,
        bugId: id,
        commentId: cid,
      })
    ) {
      return jsonError("forbidden", "Invalid image path", 403);
    }

    const { buffer, mimeType } = await readCommentImage(comment.imageUrl);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": mimeType,
        "cache-control": "private, max-age=300",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
