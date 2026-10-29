"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/src/components/ui/badge";

type Counts = { awaitingClaim: number; overdue: number; poolAwaiting: number; bugNew: number; bugUnread: number };
type PollResult = "idle" | "ok" | "transient" | "unauthorized";
type Snapshot = { counts: Counts; pollResult: PollResult };
const EMPTY: Snapshot = { counts: { awaitingClaim: 0, overdue: 0, poolAwaiting: 0, bugNew: 0, bugUnread: 0 }, pollResult: "idle" };
const Context = createContext<Snapshot>(EMPTY);
const RefreshContext = createContext<() => void>(() => {});

function validCounts(value: unknown): value is Counts {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const keys = ["awaitingClaim", "overdue", "poolAwaiting", "bugNew", "bugUnread"];
  return Object.keys(row).length === keys.length && keys.every((key) => Number.isSafeInteger(row[key]) && (row[key] as number) >= 0);
}

/** A single read-only poller shared by every navigation surface. */
export function NavBadges({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const refreshRef = useRef<() => void>(() => {});
  const refreshCounts = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    if (!enabled) return;
    let active: AbortController | null = null;
    let mounted = true;
    let refreshQueued = false;
    const cancel = () => { refreshQueued = false; active?.abort(); active = null; };
    const poll = async () => {
      if (document.visibilityState !== "visible" || active) return;
      const controller = new AbortController();
      active = controller;
      const current = () => mounted && active === controller && !controller.signal.aborted;
      try {
        const result = await fetch("/api/nav-counts", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if (!current()) return;
        if (result.status === 401 || result.status === 403) {
          setSnapshot({ counts: EMPTY.counts, pollResult: "unauthorized" });
          return;
        }
        if (!result.ok) throw new Error("Nav counts unavailable");
        const body: unknown = await result.json();
        if (!current()) return;
        if (!validCounts(body)) throw new Error("Invalid nav counts");
        setSnapshot({ counts: body, pollResult: "ok" });
      } catch {
        // All failures stay local, including unknown build/action error names.
        if (current()) setSnapshot((previous) => ({ ...previous, pollResult: "transient" }));
      } finally {
        if (active === controller) {
          active = null;
          if (mounted && refreshQueued) { refreshQueued = false; void poll(); }
        }
      }
    };
    refreshRef.current = () => {
      if (!mounted || document.visibilityState !== "visible") return;
      if (active) refreshQueued = true;
      else void poll();
    };
    const visibility = () => { if (document.visibilityState !== "visible") cancel(); };
    document.addEventListener("visibilitychange", visibility);
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 45_000);
    return () => {
      mounted = false;
      refreshRef.current = () => {};
      cancel();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled]);
  return <RefreshContext.Provider value={refreshCounts}><Context.Provider value={enabled ? snapshot : EMPTY}>{children}</Context.Provider></RefreshContext.Provider>;
}

export function useNavBadges() { return useContext(Context); }
export function useRefreshNavCounts() { return useContext(RefreshContext); }

type BadgeKey = "today" | "pool" | "bugNew" | "bugUnread";

export function navBadgeCount(counts: Counts, badgeKey?: BadgeKey): number {
  return badgeKey === "today" ? counts.awaitingClaim + counts.overdue : badgeKey === "pool" ? counts.poolAwaiting
    : badgeKey === "bugNew" ? counts.bugNew : badgeKey === "bugUnread" ? counts.bugUnread : 0;
}

export function NavBadge({ badgeKey }: { badgeKey?: BadgeKey }) {
  const { counts } = useNavBadges();
  const count = navBadgeCount(counts, badgeKey);
  return count > 0 ? <Badge>{count}</Badge> : null;
}

export function NavBadgeDot({ badgeKeys, className = "" }: { badgeKeys: readonly (BadgeKey | undefined)[]; className?: string }) {
  const { counts } = useNavBadges();
  return badgeKeys.some((key) => navBadgeCount(counts, key) > 0)
    ? <span role="img" aria-label="Unread notifications" className={`app-nav-dot ${className}`} /> : null;
}
