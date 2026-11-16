import { z } from "zod";
import { bugIdParam } from "@/domain/bug-reports";
import { bugImageResponse, bugRoute } from "@/server/bugs/route";

/** The image attached to a message in the thread (reporter or admins). */
export const GET = bugRoute({ params: z.object({ bugId: bugIdParam, commentId: bugIdParam }) }, async (bugs, viewer, { bugId, commentId }) =>
  bugImageResponse(await bugs.commentImage(viewer, bugId, commentId)),
);
