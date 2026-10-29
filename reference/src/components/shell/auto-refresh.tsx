"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useNavBadges } from "./nav-badges";

const EDITABLE = 'input, select, textarea, [contenteditable]:not([contenteditable="false"])';

/** Start-time guards only: editors opened during an in-flight refresh can still remount. */
export function AutoRefresh({ intervalMs = 45_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const badges = useNavBadges();
  const latest = useRef({ pending, badges });
  useEffect(() => { latest.current = { pending, badges }; }, [pending, badges]);

  useEffect(() => {
    const dirty = new Set<HTMLElement>();
    const edit = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const control = target.closest<HTMLElement>(EDITABLE);
      // Controlled forms own their draft lifecycle through data-refresh-hold.
      // Native event dirtiness cannot tell when a successful save clears state.
      if (!control || control.closest("[data-refresh-navigation], [data-refresh-managed]")) return;
      dirty.add(control.closest("form") ?? control);
    };
    const reset = (event: Event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      dirty.delete(event.target);
    };
    document.addEventListener("input", edit, true);
    document.addEventListener("change", edit, true);
    document.addEventListener("reset", reset, true);
    const timer = window.setInterval(() => {
      for (const owner of dirty) if (!owner.isConnected) dirty.delete(owner);
      if (document.visibilityState !== "visible" || navigator.onLine === false || latest.current.pending ||
          latest.current.badges.pollResult === "transient" || dirty.size > 0 ||
          document.querySelector("[data-refresh-hold]") ||
          (document.activeElement instanceof HTMLElement && document.activeElement.closest(EDITABLE))) return;
      latest.current.pending = true;
      startTransition(() => router.refresh());
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("input", edit, true);
      document.removeEventListener("change", edit, true);
      document.removeEventListener("reset", reset, true);
    };
  }, [intervalMs, router, startTransition]);
  return null;
}
