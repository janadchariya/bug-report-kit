"use client";

// One report in the Bug reports page (bug-report-kit admin detail and my-bugs detail; old PR #2 BugsPage.tsx
// BugDetailView, TriageEditor and ScreenshotViewer). Admins triage it; the reporter's opening clears an unread reply.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ExternalLink, Loader2, Minus, Plus } from "lucide-react";
import {
  BUG_PRIORITIES,
  BUG_STATUSES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  fullTime,
  statusChangeOf,
  triageChange,
  type BugAssignee,
  type BugDetail,
  type BugPriority,
  type BugStatus,
} from "@/domain/bug-reports";
import { errorText, screenshotUrl, type BugClient } from "./bug-client";
import { BugThread } from "./bug-thread.client";
import { SearchSelect } from "@/components/a10/search-select.client";

export function StatusBadge({ status }: { status: BugStatus }) {
  return (
    <span className="bug-badge" data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: BugPriority | null }) {
  return priority ? (
    <span className="bug-badge" data-priority={priority}>
      {PRIORITY_LABEL[priority]}
    </span>
  ) : (
    <span className="bug-muted">No priority</span>
  );
}

type Props = {
  client: BugClient;
  id: string;
  /** The report as the server rendered it, when this is the one the page opened with. */
  initial: BugDetail | null;
  assignees: BugAssignee[];
  onBack: () => void;
  onChanged: () => void;
};

export function BugDetailView({ client, id, initial, assignees, onBack, onChanged }: Props) {
  const [detail, setDetail] = useState<BugDetail | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const read = useCallback(async () => {
    try {
      setDetail(await client.detail(id));
      setError(null);
    } catch (e) {
      setError(errorText(e, "This report did not load."));
    }
  }, [client, id]);
  useEffect(() => {
    if (initial) return;
    client.detail(id).then(setDetail, (e: unknown) => setError(errorText(e, "This report did not load.")));
  }, [client, id, initial]);
  // The reporter opened a report with a new reply: clear the badge (kit reporter-read-effect.tsx).
  const unread = detail?.bug.has_unread_reply === true;
  useEffect(() => {
    if (unread) client.markRead(id).then(onChanged, () => {});
  }, [unread, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="bug-empty" role="alert">
        <p>{error}</p>
        <button type="button" className="bug-btn" onClick={() => void read()}>
          Retry
        </button>
        <button type="button" className="bug-btn" data-variant="ghost" onClick={onBack}>
          Back to the list
        </button>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="bug-loading">
        <Loader2 className="bug-spin" />
        Loading report…
      </div>
    );
  }
  const { bug } = detail;
  const who = bug.reporter.mine ? "You" : (bug.reporter.name ?? "Someone");
  return (
    <div className="bug-detail">
      <button type="button" className="bug-btn bug-back" data-variant="ghost" onClick={onBack}>
        <ChevronLeft size={14} />
        All reports
      </button>
      <header className="bug-detail-head">
        <h2>{bug.summary}</h2>
        <div className="bug-detail-meta">
          <StatusBadge status={bug.status} />
          <PriorityBadge priority={bug.priority} />
          <span>
            {who} · {fullTime(bug.created_at)}
          </span>
          {bug.assignee && <span>Assigned to {bug.assignee.name}</span>}
        </div>
      </header>
      <ScreenshotViewer id={bug.id} width={bug.screenshot_width} height={bug.screenshot_height} />
      {bug.description && (
        <section className="bug-box">
          <h3>Details</h3>
          <p className="bug-pre">{bug.description}</p>
        </section>
      )}
      <details className="bug-box">
        <summary>Technical details</summary>
        <dl className="bug-tech">
          <dt>Page</dt>
          <dd>
            <a href={bug.page_url} target="_blank" rel="noreferrer">
              {bug.page_url}
              <ExternalLink size={11} />
            </a>
          </dd>
          <dt>Browser</dt>
          <dd>
            {bug.browser_name ?? "?"} {bug.browser_version ?? ""}
          </dd>
          <dt>System</dt>
          <dd>
            {bug.os_name ?? "?"} {bug.os_version ?? ""}
          </dd>
          <dt>Device</dt>
          <dd>{bug.device_type ?? "?"}</dd>
          <dt>Window</dt>
          <dd>
            {bug.viewport_width}×{bug.viewport_height}
          </dd>
          <dt>Screenshot</dt>
          <dd>
            {bug.screenshot_width}×{bug.screenshot_height}
          </dd>
          <dt>Build</dt>
          <dd>{bug.app_build_sha ? <code>{bug.app_build_sha.slice(0, 7)}</code> : "—"}</dd>
          <dt>User agent</dt>
          <dd className="bug-break">{bug.user_agent}</dd>
        </dl>
      </details>
      {detail.can_triage && (
        <TriageEditor
          client={client}
          detail={detail}
          assignees={assignees}
          onSaved={(next) => {
            setDetail(next);
            onChanged();
          }}
        />
      )}
      {detail.history.length > 0 && (
        <section className="bug-box">
          <h3>Status history</h3>
          <ul className="bug-history">
            {detail.history.map((h) => (
              <li key={h.id}>
                <small>
                  {fullTime(h.created_at)} · {h.changed_by.name ?? "Someone"}
                </small>
                <span>
                  {h.from_status ? STATUS_LABEL[h.from_status] : "—"} → <b>{STATUS_LABEL[h.to_status]}</b>
                </span>
                {h.note && <p>{h.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="bug-box bug-thread-box">
        <h3>{bug.reporter.mine ? "Messages with the A10 team" : "Messages with the reporter"}</h3>
        <p className="bug-muted">
          {bug.reporter.mine ? "Reply here or send another screenshot." : "Ask the reporter for anything that would help you reproduce it."}
        </p>
        <BugThread client={client} bugId={bug.id} initial={detail.comments} onSent={onChanged} />
      </section>
    </div>
  );
}

type TriageProps = { client: BugClient; detail: BugDetail; assignees: BugAssignee[]; onSaved: (detail: BugDetail) => void };

function TriageEditor({ client, detail, assignees, onSaved }: TriageProps) {
  const { bug } = detail;
  const [status, setStatus] = useState<BugStatus>(bug.status);
  const [priority, setPriority] = useState<BugPriority | "">(bug.priority ?? "");
  const [assignee, setAssignee] = useState(bug.assignee?.key ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = triageChange(bug, { status, priority, assignee, note });
  const dirty = Object.keys(change).length > 0;
  // A former assignee who is no longer an admin still shows, so the form does not silently clear them.
  const people = bug.assignee && !assignees.some((a) => a.key === bug.assignee?.key) ? [...assignees, { key: bug.assignee.key, name: bug.assignee.name ?? "Former assignee" }] : assignees;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await client.update(bug.id, change));
      setNote("");
      setSaved(true);
    } catch (e) {
      setError(errorText(e, "Could not save. Try again."));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="bug-box bug-triage">
      <h3>Triage</h3>
      <div className="bug-triage-grid">
        <label className="bug-select">
          Status
          <SearchSelect value={status} disabled={saving} onChange={(next) => setStatus(next as BugStatus)}>
            {BUG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </SearchSelect>
        </label>
        <label className="bug-select">
          Priority
          <SearchSelect value={priority} disabled={saving} onChange={(next) => setPriority(next as BugPriority | "")}>
            <option value="">Not set</option>
            {BUG_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </SearchSelect>
        </label>
        <label className="bug-select">
          Assigned to
          <SearchSelect value={assignee} disabled={saving} onChange={setAssignee}>
            <option value="">Nobody</option>
            {people.map((a) => (
              <option key={a.key} value={a.key}>
                {a.name}
              </option>
            ))}
          </SearchSelect>
        </label>
      </div>
      {statusChangeOf(bug.status, status, null) && (
        <label className="bug-field">
          <span>Note for the history (optional)</span>
          <textarea rows={2} maxLength={2000} value={note} disabled={saving} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      {error && (
        <p className="bug-error" role="alert">
          {error}
        </p>
      )}
      <div className="bug-form-actions">
        {saved && !dirty && <span className="bug-saved">Report updated</span>}
        <button type="button" className="bug-btn" data-variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? (
            <>
              <Loader2 size={14} className="bug-spin" />
              Saving…
            </>
          ) : (
            "Save"
          )}
        </button>
      </div>
    </section>
  );
}

// Zoom and drag-to-pan (kit bug-screenshot-viewer.tsx and use-drag-to-pan.ts).
function ScreenshotViewer({ id, width, height }: { id: string; width: number; height: number }) {
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const start = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const [grabbing, setGrabbing] = useState(false);
  useEffect(() => {
    if (!grabbing) return;
    const move = (e: MouseEvent) => {
      const el = box.current;
      if (!el) return;
      el.scrollLeft = start.current.left - (e.clientX - start.current.x);
      el.scrollTop = start.current.top - (e.clientY - start.current.y);
    };
    const up = () => setGrabbing(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [grabbing]);
  const src = screenshotUrl(id);
  return (
    <figure className="bug-shot">
      <div className="bug-shot-tools">
        <button type="button" className="bug-icon" aria-label="Zoom out" disabled={zoom <= 0.25} onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
          <Minus size={13} />
        </button>
        <button type="button" className="bug-zoom-value" title="Reset zoom" onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className="bug-icon" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
          <Plus size={13} />
        </button>
        <small>Drag the image to move around</small>
        <a className="bug-btn" data-variant="ghost" href={src} target="_blank" rel="noreferrer">
          Open full size
          <ExternalLink size={12} />
        </a>
      </div>
      <div
        ref={box}
        className="bug-shot-frame"
        data-grabbing={grabbing || undefined}
        onMouseDown={(e) => {
          if (e.button !== 0 || !box.current) return;
          start.current = { x: e.clientX, y: e.clientY, left: box.current.scrollLeft, top: box.current.scrollTop };
          setGrabbing(true);
          e.preventDefault();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a private image served by A10, not optimisable */}
        <img src={src} alt="Screenshot of the problem" draggable={false} style={{ width: `${zoom * 100}%`, aspectRatio: `${width}/${height}` }} />
      </div>
    </figure>
  );
}
