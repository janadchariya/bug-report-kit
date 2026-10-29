"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavBadge } from "@/src/components/shell/nav-badges";

// Supply server-computed capabilities. Keep both destinations in mobile More,
// preserving the host's existing primary tabs. One NavBadges surrounds all nav.
export function BugNavigation({ canReport, canTriage }: { canReport: boolean; canTriage: boolean }) {
  const path = usePathname();
  const mine = path === "/bugs/mine" || path.startsWith("/bugs/mine/");
  const triage = path === "/bugs" || (path.startsWith("/bugs/") && !mine);
  return <nav aria-label="Bug reports">
    {canTriage ? <Link href="/bugs" aria-current={triage ? "page" : undefined}>Bugs<NavBadge badgeKey="bugNew" /></Link> : null}
    {canReport ? <Link href="/bugs/mine" aria-current={mine ? "page" : undefined}>My bug reports<NavBadge badgeKey="bugUnread" /></Link> : null}
    <Link href="/guide#report-a-bug">How to report a bug</Link>
  </nav>;
}
