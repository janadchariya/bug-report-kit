import { BookOpen, CalendarCheck, ListChecks, type LucideIcon } from 'lucide-react';
import type { Permission } from '@/src/lib/permissions';
export interface NavItem {
  readonly href: string;
  /** English menu label (copy rule 2026-10-17). */
  readonly label: string;
  /** Label under the icon in the phone tab bar. */
  readonly shortLabel: string;
  readonly icon: LucideIcon;
  /** A list allows any permission; { all } requires every permission. */
  readonly permission: Permission | readonly Permission[] | { readonly all: readonly Permission[] } | null;
  readonly order: number;
  /** Rendered as the sidebar's create button instead of a menu row. */
  readonly create?: boolean;
  /** Secondary destinations stay in More without displacing existing phone tabs. */
  readonly moreOnly?: boolean;
  readonly badgeKey?: "today" | "pool" | "bugNew" | "bugUnread";
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/today', label: 'Today', shortLabel: 'Today', icon: CalendarCheck, permission: null, order: 10, badgeKey: 'today' },
  { href: '/bugs', label: 'Bugs', shortLabel: 'Bugs', icon: ListChecks, permission: 'bugs.triage', order: 88, badgeKey: 'bugNew', moreOnly: true },
  { href: '/bugs/mine', label: 'My bug reports', shortLabel: 'My bugs', icon: ListChecks, permission: 'bugs.report', order: 89, badgeKey: 'bugUnread', moreOnly: true },
  { href: '/guide', label: 'Guide', shortLabel: 'Guide', icon: BookOpen, permission: null, order: 95 },
];
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/bugs") return pathname === href || (pathname.startsWith("/bugs/") && !pathname.startsWith("/bugs/mine"));
  if (href === "/bugs/mine") return pathname === href || pathname.startsWith(`${href}/`);
  return pathname === href;
}

export function filterNavItems(items: readonly NavItem[], allowed: (permission: Permission) => boolean): NavItem[] {
  return items.filter((item) => item.permission === null || (
    typeof item.permission === "string" ? allowed(item.permission)
      : "all" in item.permission ? item.permission.all.every(allowed)
        : item.permission.some(allowed)
  )).sort((a, b) => a.order - b.order);
}

