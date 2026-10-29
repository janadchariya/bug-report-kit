"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar } from '@/src/components/ui/avatar';
import { NavBadge } from './nav-badges';
import { isNavItemActive, type NavItem } from './nav-items';
/** Minimal shell: merge these bug destinations into the host's existing navigation. */
export function Sidebar({ items, displayName, roleLabels, signOutAction }: {
  readonly items: readonly NavItem[]; readonly displayName: string; readonly roleLabels: readonly string[]; readonly signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname(), [open, setOpen] = useState(false);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, []);
  const link = (item: NavItem, menu = false) => <Link key={item.href} href={item.href} aria-label={item.label} role={menu ? 'menuitem' : undefined} aria-current={isNavItemActive(pathname,item.href) ? 'page' : undefined}>{item.label}<NavBadge badgeKey={item.badgeKey}/></Link>;
  return <aside className="app-sidebar"><nav aria-label="Sidebar menu">{items.filter(item => item.href !== '/bugs/mine').map(item => link(item))}</nav>
    <button type="button" aria-label="User menu" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)}><Avatar name={displayName}/>{displayName}<small>{roleLabels.join(' · ')}</small></button>
    {open ? <div role="menu" aria-label="User menu">{items.filter(item => item.href === '/bugs/mine').map(item => link(item,true))}<form action={signOutAction}><button type="submit" role="menuitem">Sign out</button></form></div> : null}
  </aside>;
}
