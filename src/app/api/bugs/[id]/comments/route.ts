import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, jsonError, jsonOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { addBugComment } from "@/lib/bugs/add-comment";
import { getBugCompanyAndReporter } from "@/lib/bugs/get-bug";
import { notifyReporterOnBugComment } from "@/lib/bugs/notify-chat";
import { deferNotify } from "@/lib/notifications/defer";

const Body = z.object({
  body: z.string().min(1).max(4000),
  imageUrl: z.string().url().optional().nullable(),
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
      return jsonError("forbidden", "Cannot comment on this bug", 403);
    }
    const { body, imageUrl } = Body.parse(await req.json());
    const comment = await addBugComment({
      bugReportId: id,
      authorId: user.id,
      body,
      imageUrl,
    });
    // Ping the reporter (not the commenter) so they know to come reply.
    deferNotify(() =>
      notifyReporterOnBugComment({
        bugReportId: id,
        commenterId: user.id,
        commenterName: user.fullName,
        commentBody: body,
      }),
    );
    return jsonOk({ comment });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError("validation", "Invalid body", 400, { issues: err.issues });
    }
    return handleApiError(err);
  }
}
