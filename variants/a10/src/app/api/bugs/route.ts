import { z } from "zod";
import { bugRoute } from "@/server/bugs/route";

/** A new report: multipart `meta` (JSON details) and `file` (the annotated screenshot). 201 {id}; 429 RATE_LIMITED. */
export const POST = bugRoute({ params: z.object({}), body: "multipart", created: true }, (bugs, viewer, _params, { upload }) =>
  bugs.create(viewer, upload),
);
