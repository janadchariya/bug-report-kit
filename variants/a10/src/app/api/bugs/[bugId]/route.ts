import { z } from "zod";
import { bugIdParam } from "@/domain/bug-reports";
import { bugRoute } from "@/server/bugs/route";

/** One report with its thread and status history; 404 for anyone but the reporter and the admins. */
export const GET = bugRoute({ params: z.object({ bugId: bugIdParam }) }, (bugs, viewer, { bugId }) => bugs.detail(viewer, bugId));
