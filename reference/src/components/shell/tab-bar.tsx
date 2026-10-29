"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { BottomSheet } from "@/src/components/ui/bottom-sheet";
import { Badge } from "@/src/components/ui/badge";
import { isNavItemActive, type NavItem } from "./nav-items";
import { NavBadge, useNavBadges } from "./nav-badges";

const MAX_SLOTS = 4;

export function TabBar({ items }: { readonly items: readonly NavItem[] }) {
  const pathname = usePathname();
  const { counts } = useNavBadges();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const primary = items.filter((item) => !item.moreOnly);
  const overflow = items.some((item) => item.moreOnly) || items.length > MAX_SLOTS;
  const visible = overflow ? primary.slice(0, MAX_SLOTS - 1) : primary;
  const rest = items.filter((item) => !visible.includes(item));
  const moreCount = rest.reduce((sum, { badgeKey }) => sum + (
    badgeKey === "today" ? counts.awaitingClaim + counts.overdue
      : badgeKey === "pool" ? counts.poolAwaiting
        : badgeKey === "bugNew" ? counts.bugNew
          : badgeKey === "bugUnread" ? counts.bugUnread : 0
  ), 0);
  const moreActive = rest.some(({ href }) => isNavItemActive(pathname, href));
  return (
    <nav className="app-tabbar" aria-label="Main menu">
      {visible.map(({ href, shortLabel, icon: Icon, badgeKey }) => (
        <Link key={href} href={href} aria-current={isNavItemActive(pathname, href) ? "page" : undefined} className="app-tabbar__item">
          <Icon aria-hidden="true" size={22} strokeWidth={1.75} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{shortLabel}<NavBadge badgeKey={badgeKey} /></span>
        </Link>
      ))}
      {overflow ? (
        <>
          <button ref={moreRef} type="button" className="app-tabbar__item" aria-current={moreActive ? "page" : undefined} aria-label="More" aria-description={moreCount > 0 ? `${moreCount} notification${moreCount === 1 ? "" : "s"}` : undefined} onClick={() => setMoreOpen(true)}>
            <MoreHorizontal aria-hidden="true" size={22} strokeWidth={1.75} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>More{moreCount > 0 ? <Badge>{moreCount}</Badge> : null}</span>
          </button>
          <BottomSheet open={moreOpen} onOpenChange={setMoreOpen} title="More" returnFocusRef={moreRef}>
            <ul className="app-more-list">
              {rest.map(({ href, label, icon: Icon, badgeKey }) => (
                <li key={href}>
                  <Link href={href} aria-current={isNavItemActive(pathname, href) ? "page" : undefined} onClick={() => setMoreOpen(false)}>
                    <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
                    <span>{label}</span>
                    <NavBadge badgeKey={badgeKey} />
                  </Link>
                </li>
              ))}
            </ul>
          </BottomSheet>
        </>
      ) : null}
    </nav>
  );
}
