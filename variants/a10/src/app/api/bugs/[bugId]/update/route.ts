import { z } from "zod";
import { bugIdParam, bugUpdateBody } from "@/domain/bug-reports";
import { bugRoute } from "@/server/bugs/route";

/** An admin's triage change: {status?, priority?, assignee_key?, note?}. Answers the report as it now is. */
export const POST = bugRoute({ params: z.object({ bugId: bugIdParam }), body: "json", schema: bugUpdateBody }, (bugs, viewer, { bugId }, { json }) =>
  bugs.update(viewer, bugId, json),
);
