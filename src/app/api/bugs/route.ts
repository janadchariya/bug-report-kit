import type { NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, jsonError, jsonOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createBug } from "@/lib/bugs/create-bug";
import { listBugsWithMeta } from "@/lib/bugs/list-bugs";
import { notifyBugCreated } from "@/lib/bugs/notify-chat";
import { bugSubmitLimiter } from "@/lib/bugs/rate-limit";
import { deferNotify } from "@/lib/notifications/defer";
import { isValidScreenshotPath } from "@/lib/bugs/storage";

const CreateBody = z.object({
  bugId: z.string().uuid(),
  screenshotPath: z.string().min(1),
  screenshotWidth: z.number().int().min(1).max(10_000),
  screenshotHeight: z.number().int().min(1).max(10_000),
  summary: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  pageUrl: z.string().url().max(2000),
  viewportWidth: z.number().int().min(1).max(10_000),
  viewportHeight: z.number().int().min(1).max(10_000),
  userAgent: z.string().min(1).max(1000),
  osName: z.string().max(100).optional().nullable(),
  osVersion: z.string().max(100).optional().nullable(),
  browserName: z.string().max(100).optional().nullable(),
  browserVersion: z.string().max(100).optional().nullable(),
  deviceType: z.enum(["desktop", "tablet", "mobile"]).optional().nullable(),
  appBuildSha: z.string().max(100).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (bugSubmitLimiter.check(user.id) === "block") {
      return jsonError(
        "rate_limited",
        "Please wait before submitting another bug.",
        429,
      );
    }
    const body = CreateBody.parse(await req.json());
    if (
      !isValidScreenshotPath(body.screenshotPath, {
        companyId: user.companyId,
        bugId: body.bugId,
      })
    ) {
      return jsonError(
        "invalid_path",
        "Screenshot path does not match issued upload URL.",
        400,
      );
    }
    const bug = await createBug({
      bugId: body.bugId,
      companyId: user.companyId,
      reporterId: user.id,
      summary: body.summary,
      description: body.description ?? null,
      screenshotPath: body.screenshotPath,
      screenshotWidth: body.screenshotWidth,
      screenshotHeight: body.screenshotHeight,
      pageUrl: body.pageUrl,
      viewportWidth: body.viewportWidth,
      viewportHeight: body.viewportHeight,
      userAgent: body.userAgent,
      osName: body.osName ?? null,
      osVersion: body.osVersion ?? null,
      browserName: body.browserName ?? null,
      browserVersion: body.browserVersion ?? null,
      deviceType: body.deviceType ?? null,
      appBuildSha: body.appBuildSha ?? null,
    });
    deferNotify(() => notifyBugCreated(bug, user.fullName));
    return jsonOk({ id: bug.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return jsonError("validation", "Invalid request body", 400, { issues: err.issues });
    }
    return handleApiError(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as
      | "new"
      | "in_progress"
      | "done"
      | "cancelled"
      | null;
    const priority = url.searchParams.get("priority") as
      | "low"
      | "medium"
      | "high"
      | "critical"
      | null;
    const companyId = url.searchParams.get("companyId");
    const cursor = url.searchParams.get("cursor");
    const q = url.searchParams.get("q");
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 25;

    const page = await listBugsWithMeta({
      viewer: { id: user.id, role: user.role, companyId: user.companyId },
      status: status ?? undefined,
      priority: priority ?? undefined,
      companyId: companyId ?? undefined,
      cursor: cursor ?? undefined,
      q: q ?? undefined,
      limit,
    });
    return jsonOk(page);
  } catch (err) {
    return handleApiError(err);
  }
}
