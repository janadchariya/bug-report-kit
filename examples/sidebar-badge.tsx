/**
 * EXAMPLE — how the source project wires nav entries + unread badges.
 * The source app has its own sidebar system; the target project should
 * adapt this to whatever nav it uses. The parts that transfer:
 *
 * 1. Two nav destinations:
 *    - /my-bugs      → every logged-in user ("Bug ของฉัน" / "My bugs")
 *    - /admin/bugs   → ADMIN only ("Bug Reports" triage board)
 *
 * 2. Two badge counts (see src/lib/bugs/badge-counts.ts), fetched
 *    server-side in the app-shell layout and passed down:
 */
import { countNewBugs, countUnreadBugReplies } from "@/lib/bugs/badge-counts";

// In the app-shell layout (server component), alongside other layout data:
export async function getBugBadgeCounts(user: { id: string; role: string }) {
  const [bugNewCount, bugUnreadCount] = await Promise.all([
    // Admin badge: bugs still in NEW status (need triage)
    user.role === "ADMIN" ? countNewBugs() : Promise.resolve(0),
    // Reporter badge: my bugs with replies I haven't read yet.
    // Cleared when the reporter opens the bug detail page, which fires
    // POST /api/bugs/[id]/reporter-read (see reporter-read-effect.tsx).
    countUnreadBugReplies(user.id),
  ]);
  return { bugNewCount, bugUnreadCount };
}

// Then in the nav component, render a count pill next to each item, e.g.:
//   <NavLink href="/my-bugs">My bugs {bugUnreadCount > 0 && <Badge n={bugUnreadCount} />}</NavLink>
//   {role === "ADMIN" && <NavLink href="/admin/bugs">Bug reports {bugNewCount > 0 && <Badge n={bugNewCount} />}</NavLink>}
