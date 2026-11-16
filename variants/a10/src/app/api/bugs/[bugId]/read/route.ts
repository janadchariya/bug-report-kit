import { z } from "zod";
import { bugIdParam } from "@/domain/bug-reports";
import { bugRoute } from "@/server/bugs/route";

/** The reporter opened the report: clears its unread reply. */
export const POST = bugRoute({ params: z.object({ bugId: bugIdParam }), body: "json", schema: z.object({}) }, (bugs, viewer, { bugId }) =>
  bugs.markRead(viewer, bugId),
);
