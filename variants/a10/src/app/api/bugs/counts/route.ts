import { z } from "zod";
import { bugRoute } from "@/server/bugs/route";

/** The sidebar badge: {new_count (admins, else 0), unread_count}. */
export const GET = bugRoute({ params: z.object({}) }, (bugs, viewer) => bugs.counts(viewer));
