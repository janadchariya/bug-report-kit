"use client";

import { startTransition, useEffect, useRef } from "react";
import { markBugReadAction } from "@/app/actions/bugs";
import { useRefreshNavCounts } from "@/src/components/shell/nav-badges";

/** Mounted only inside displayed detail. List rendering and older pages never acknowledge activity. */
export function ReporterReadEffect({ bugId, isOwner, seenActivitySeq }: { bugId: string; isOwner: boolean; seenActivitySeq: number }) {
  const refreshCounts = useRefreshNavCounts();
  const acknowledged = useRef<string | null>(null);
  useEffect(() => {
    const key = `${bugId}:${seenActivitySeq}`;
    if (!isOwner || acknowledged.current === key) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function acknowledge(attempt: number) {
      startTransition(async () => {
        let ok = false;
        try { ok = (await markBugReadAction({ bugId, seenActivitySeq })).ok; }
        catch { /* Retry a transport failure with the same displayed watermark. */ }
        if (cancelled) return;
        if (ok) { acknowledged.current = key; refreshCounts(); }
        else if (attempt < 2) timer = setTimeout(() => acknowledge(attempt + 1), 1_000 * 2 ** attempt);
      });
    }
    acknowledge(0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [bugId, isOwner, seenActivitySeq, refreshCounts]);
  return null;
}
