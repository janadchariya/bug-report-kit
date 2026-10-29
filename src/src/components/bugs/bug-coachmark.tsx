"use client";

import { useId, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { captureShortcut } from "@/src/lib/bugs/report-dialog";
import "./bug-coachmark.css";

const STORAGE_KEY = "bug-report-kit.coachmarkSeen";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): boolean {
  try { return Boolean(localStorage.getItem(STORAGE_KEY)); }
  catch { return true; }
}

// The first server/client render omits the coachmark; browser storage is read
// after hydration through the external store instead of changing the HTML.
function getServerSnapshot(): boolean { return true; }

/** The FAB uses this too, so opening the report consumes the introduction. */
export function dismissBugCoachmark(): void {
  try { localStorage.setItem(STORAGE_KEY, "1"); }
  catch { /* Browser storage may be blocked or full. */ }
  for (const listener of listeners) listener();
}

export function BugCoachmark({ hidden = false }: { hidden?: boolean }) {
  const titleId = useId();
  const seen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [dismissed, setDismissed] = useState(false);
  function dismiss() {
    setDismissed(true);
    dismissBugCoachmark();
  }
  if (hidden || seen || dismissed) return null;
  return <section aria-labelledby={titleId} className="bug-coachmark" data-shell-action-footprint>
    <span className="bug-coachmark__pointer" aria-hidden="true" />
    <p id={titleId} className="bug-coachmark__title">How to report a bug</p>
    <ol className="bug-coachmark__steps">
      <li>แคปหน้าจอที่เจอปัญหา ({captureShortcut()})</li>
      <li>กดปุ่มแมลงนี้</li>
      <li>วางภาพ (⌘/Ctrl+V) แล้วส่ง</li>
    </ol>
    <button type="button" className="bug-coachmark__dismiss" onClick={dismiss}>Got it</button>
    <Link className="bug-coachmark__learn" href="/guide#report-a-bug" onClick={dismiss}>Learn more</Link>
  </section>;
}
