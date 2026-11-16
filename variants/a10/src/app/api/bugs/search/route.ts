import { z } from "zod";
import { bugListBody } from "@/domain/bug-reports";
import { bugRoute } from "@/server/bugs/route";

/** A page of reports for the filters in the JSON body: admins see every report (mine: their own), others their own. */
export const POST = bugRoute({ params: z.object({}), body: "json", schema: bugListBody, read: true }, (bugs, viewer, _params, { json }) =>
  bugs.list(viewer, json),
);
