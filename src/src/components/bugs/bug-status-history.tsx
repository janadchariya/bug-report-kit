"use client";

import { useMemo, useState, useTransition } from "react";
import { loadBugThreadAction } from "@/app/actions/bugs";
import { Button } from "@/src/components/ui/button";
import type { BugStaff, BugStatusChange } from "@/src/lib/bugs/types";
import { formatBangkokDateTime } from "@/src/lib/locale-time";
import { BUG_STATUS_LABELS } from "./bug-badges";

export function BugStatusHistory({ bugId, scope, initial, historyBefore, staff = [] }: { bugId: string; scope: "mine" | "triage"; initial: BugStatusChange[]; historyBefore: string | null; staff?: BugStaff[] }) {
  const [older, setOlder] = useState<BugStatusChange[]>([]);
  const [loadedCursor, setLoadedCursor] = useState<{ source: string | null; before: string | null } | null>(null);
  const before = loadedCursor?.source === historyBefore ? loadedCursor.before : historyBefore;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const history = useMemo(() => [...new Map([...older, ...initial].map((change) => [change.id, change])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [older, initial]);
  const names = new Map(staff.map((user) => [user.id, user.nickname ?? user.displayName]));
  function loadOlder() {
    if (!before || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await loadBugThreadAction({ bugId, scope, historyBefore: before });
        if (!result.ok) { setError("โหลดประวัติก่อนหน้าไม่สำเร็จ กรุณาลองอีกครั้ง"); return; }
        setOlder((previous) => [...result.data.statusChanges, ...previous]); setLoadedCursor({ source: historyBefore, before: result.data.historyBefore });
      } catch { setError("โหลดประวัติก่อนหน้าไม่สำเร็จ กรุณาลองอีกครั้ง"); }
    });
  }
  return <section className="bugs-history bugs-detail-card" aria-label="Status history">
    <h3>Status history</h3>
    {before ? <Button onClick={loadOlder} disabled={pending}>Load older history</Button> : null}
    {error ? <p role="alert">{error}</p> : null}
    <ol>{history.map((change) => <li key={change.id}>
      <span>{change.isMine ? "You" : (change.changedByUserId ? names.get(change.changedByUserId) : undefined) ?? "Team member"} · <time dateTime={change.createdAt}>{formatBangkokDateTime(new Date(change.createdAt))}</time></span>
      <p>{change.fromStatus ? BUG_STATUS_LABELS[change.fromStatus] : "—"} → <strong>{BUG_STATUS_LABELS[change.toStatus]}</strong>{change.toStatus === "in_progress" && (change.fromStatus === "done" || change.fromStatus === "cancelled") ? " (Reopened)" : ""}</p>
      {change.reason ? <p className="bugs-user-text">{change.reason}</p> : null}
    </li>)}</ol>
    {!history.length ? <p className="bugs-helper">ยังไม่มีการเปลี่ยน status</p> : null}
  </section>;
}
