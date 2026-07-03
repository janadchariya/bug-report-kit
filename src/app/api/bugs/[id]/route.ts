import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, jsonError, jsonOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBugDetail } from "@/lib/bugs/get-bug";
import { updateBug } from "@/lib/bugs/update-bug";

const PatchBody = z.object({
  status: z
    .enum(["new", "in_progress", "done", "cancelled"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional().nullable(),
  // Seeded user IDs in this app are not UUIDs (e.g. "user-admin",
  // "user-accounting") — accept any non-empty string instead of forcing UUID.
  assignedToId: z.string().min(1).nullable().optional(),
  note: z.string().max(2000).optional(),
});

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await ctx.params;
    const detail = await getBugDetail(id);
    if (!detail) return jsonError("not_found", "Bug not found", 404);
    const isOwner = detail.bug.reporterId === user.id;
    if (!isOwner && user.role !== "ADMIN") {
      return jsonError("forbidden", "Cannot view this bug", 403);
    }
    return jsonOk(detail);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (user.role !== "ADMIN") {
      return jsonError("forbidden", "Admin role required", 403);
    }
    const { id } = await ctx.params;
    const body = PatchBody.parse(await req.json());
    const bug = await updateBug({
      id,
      changedById: user.id,
      patch: {
        status: body.status,
        priority: body.priority,
        assignedToId: body.assignedToId,
      },
      note: body.note,
    });
    return jsonOk({ bug });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError("validation", "Invalid body", 400, { issues: err.issues });
    }
    return handleApiError(err);
  }
}
