import { NextResponse } from "next/server";

import { handleApiError, jsonError } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBugDetail } from "@/lib/bugs/get-bug";
import { readScreenshot } from "@/lib/bugs/storage";

/**
 * Serves the bug-report screenshot PNG. Auth-gated: only the reporter or
 * an admin may read it. Unlike /api/files which is in the middleware's
 * PUBLIC_PATH_PREFIXES allowlist, this route runs through the auth gate.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await ctx.params;
    const detail = await getBugDetail(id);
    if (!detail) return jsonError("not_found", "Bug not found", 404);
    const isOwner = detail.bug.reporterId === user.id;
    if (!isOwner && user.role !== "ADMIN") {
      return jsonError("forbidden", "Cannot view this screenshot", 403);
    }
    const { buffer, mimeType } = await readScreenshot(detail.bug.screenshotPath);
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
