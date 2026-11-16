import { z } from "zod";
import { bugIdParam } from "@/domain/bug-reports";
import { bugRoute } from "@/server/bugs/route";

/** A message in the thread: multipart `body` and an optional image in `file`. 201 {comment}. */
export const POST = bugRoute(
  { params: z.object({ bugId: bugIdParam }), body: "multipart", created: true },
  (bugs, viewer, { bugId }, { upload }) => bugs.comment(viewer, bugId, upload),
);
