import type { NextRequest } from "next/server";

import { handleApiError, jsonOk } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createScreenshotUpload } from "@/lib/bugs/storage";

export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    const bugId = crypto.randomUUID();
    const result = await createScreenshotUpload({
      bugId,
      companyId: user.companyId,
    });
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err);
  }
}
