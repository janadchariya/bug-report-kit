import { z } from "zod";
import { bugIdParam } from "@/domain/bug-reports";
import { bugImageResponse, bugRoute } from "@/server/bugs/route";

/** The report's screenshot from the private bucket (reporter or admins). */
export const GET = bugRoute({ params: z.object({ bugId: bugIdParam }) }, async (bugs, viewer, { bugId }) =>
  bugImageResponse(await bugs.screenshot(viewer, bugId)),
);
