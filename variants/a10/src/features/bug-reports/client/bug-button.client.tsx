"use client";

// The floating bug button (bug-report-kit bug-feedback-widget.tsx and bug-coachmark.tsx; old PR #2 BugReportButton.tsx).
// Everyone signed in sees it; it steps aside while a task is open (/t/<id>, the drawer or the task page). A first-time
// tip explains the three steps once per browser. A sent report shows a short note with a link to it.
import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Bug, Check } from "lucide-react";
import { BUG_COUNTS_EVENT, bugPath } from "@/domain/bug-reports";
import { captureShortcut } from "../lib/image";
import { collectClientContext } from "../lib/user-agent";
import type { AnnotatedReport } from "./annotation-modal.client";
import { createBugClient, errorText } from "./bug-client";
import "../bugs.css";

const AnnotationModal = lazy(() => import("./annotation-modal.client").then((m) => ({ default: m.AnnotationModal })));

const TASK_PATH = /^\/t\/[^/]+\/?$/;
const TIP_KEY = "a10.bug-tip-seen.v1";
const SENT_NOTE_MS = 8_000;
const tipListeners = new Set<() => void>();
const tipSeen = () => {
  try {
    return !!localStorage.getItem(TIP_KEY);
  } catch {
    return true;
  }
};
/** Marks the first-time tip as seen; the beginner's guide calls it after it has shown the bug button. */
export function dismissBugTip() {
  try {
    localStorage.setItem(TIP_KEY, "1");
  } catch {
    // A private window: the tip just shows again next time.
  }
  tipListeners.forEach((listener) => listener());
}
const subscribeTip = (listener: () => void) => {
  tipListeners.add(listener);
  return () => void tipListeners.delete(listener);
};

type Phase = "idle" | "open" | "sending" | "sent";

export function BugReportButton({ buildSha }: { buildSha: string | null }) {
  const [client] = useState(() => createBugClient());
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const seen = useSyncExternalStore(subscribeTip, tipSeen, () => true);
  const covered = TASK_PATH.test(usePathname());

  useEffect(() => {
    if (phase !== "sent") return;
    const timer = setTimeout(() => setPhase((p) => (p === "sent" ? "idle" : p)), 1500);
    return () => clearTimeout(timer);
  }, [phase]);
  useEffect(() => {
    if (!sentId) return;
    const timer = setTimeout(() => setSentId(null), SENT_NOTE_MS);
    return () => clearTimeout(timer);
  }, [sentId]);

  async function send(report: AnnotatedReport) {
    setPhase("sending");
    setError(null);
    try {
      const { id } = await client.create({ ...report, context: collectClientContext(buildSha) });
      setPhase("sent");
      setSentId(id);
      window.dispatchEvent(new Event(BUG_COUNTS_EVENT));
    } catch (e) {
      setError(errorText(e, "Could not send the report. Try again."));
      setPhase("open"); // The dialog keeps the screenshot and the marks for a retry.
    }
  }

  const dialogOpen = phase === "open" || phase === "sending";
  return (
    <>
      {!covered && !dialogOpen && (
        <>
          {sentId ? (
            <div className="bug-notice" role="status">
              <b>Report sent. Thank you.</b>
              <p>The A10 team will reply in Bug reports.</p>
              <div>
                <button type="button" className="bug-btn" data-variant="ghost" onClick={() => setSentId(null)}>
                  Close
                </button>
                <Link href={bugPath(sentId) as Route} className="bug-btn" data-variant="primary" onClick={() => setSentId(null)}>
                  View
                </Link>
              </div>
            </div>
          ) : (
            !seen &&
            phase === "idle" && (
              <div className="bug-tip" role="note">
                <b>Found a problem?</b>
                <ol>
                  <li>Take a screenshot ({captureShortcut(navigator.userAgent)})</li>
                  <li>Click the bug button</li>
                  <li>Paste it (⌘/Ctrl+V), mark it and send</li>
                </ol>
                <button type="button" className="bug-btn" data-variant="primary" onClick={dismissBugTip}>
                  Got it
                </button>
              </div>
            )
          )}
          <button
            type="button"
            className="bug-fab"
            data-tour="bug"
            data-sent={phase === "sent" || undefined}
            aria-label="Report a problem"
            title="Report a problem"
            onClick={() => {
              dismissBugTip();
              setSentId(null);
              setError(null);
              setPhase("open");
            }}
          >
            {phase === "sent" ? <Check size={22} /> : <Bug size={22} />}
          </button>
        </>
      )}
      {dialogOpen && (
        <Suspense fallback={null}>
          <AnnotationModal
            submitting={phase === "sending"}
            error={error}
            onClose={() => {
              setPhase("idle");
              setError(null);
            }}
            onSubmit={(report) => void send(report)}
          />
        </Suspense>
      )}
    </>
  );
}
