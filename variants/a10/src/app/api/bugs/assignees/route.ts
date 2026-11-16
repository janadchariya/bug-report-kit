import { z } from "zod";
import { bugRoute } from "@/server/bugs/route";

/** Who a report can be assigned to (admins only): the A10 admins and the admin asking. */
export const GET = bugRoute({ params: z.object({}) }, async (bugs, viewer) => ({ people: await bugs.assignees(viewer) }));
