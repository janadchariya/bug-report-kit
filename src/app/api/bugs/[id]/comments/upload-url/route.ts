import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, jsonError, jsonOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBugCompanyAndReporter } from "@/lib/bugs/get-bug";
import { createCommentImageUpload } from "@/lib/bugs/storage";

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const Body = z.object({
  commentId: z.string().uuid(),
  mimeType: z.enum(ALLOWED_MIME_TYPES).optional().default("image/png"),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await ctx.params;
    const meta = await getBugCompanyAndReporter(id);
    if (!meta) return jsonError("not_found", "Bug not found", 404);
    const isOwner = meta.reporterId === user.id;
    if (!isOwner && user.role !== "ADMIN") {
      return jsonError("forbidden", "Cannot upload to this bug", 403);
    }
    const { commentId, mimeType } = Body.parse(await req.json());
    const result = await createCommentImageUpload({
      bugId: id,
      companyId: meta.companyId,
      commentId,
      mimeType,
    });
    return jsonOk(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError("validation", "Invalid body", 400, { issues: err.issues });
    }
    return handleApiError(err);
  }
}
