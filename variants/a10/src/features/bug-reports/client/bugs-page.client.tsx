"use client";

// The Bug reports page (bug-report-kit admin/bugs split view and my-bugs pages; old PR #2 BugsPage.tsx). A10 admins see
// every report grouped by status, with filters and search, and triage it; everyone else sees their own reports and the
// replies. The open report is in the address (/bugs/<id>), so a link from Google Chat opens it. Filters are browser
// state; the first page comes from the server.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Bug, Loader2, RefreshCw, Search } from "lucide-react";
import {
  BUG_COUNTS_EVENT,
  BUG_LIST_SCOPES,
  BUG_SCOPE_LABEL,
  bugScopeFilters,
  BUG_PRIORITIES,
  BUG_STATUSES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  bugPath,
  groupByStatus,
  relativeTime,
  type BugPriority,
  type BugListScope,
  type BugReport,
  type BugStatus,
  type BugsPageData,
} from "@/domain/bug-reports";
import { createBugClient, errorText, screenshotUrl } from "./bug-client";
import { BugDetailView, PriorityBadge } from "./bug-detail.client";
import "../bugs.css";
import { SearchSelect } from "@/components/a10/search-select.client";

type Props = { data: BugsPageData; openId: string | null };

const countsChanged = () => window.dispatchEvent(new Event(BUG_COUNTS_EVENT));
const WIDE = "(min-width: 900px)";
const isWide = () => window.matchMedia(WIDE).matches;
const subscribeWide = (listener: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};

export function BugsPage({ data, openId }: Props) {
  const ready = data.state === "ready" ? data : null;
  const isAdmin = ready?.isAdmin ?? false;
  const [client] = useState(() => createBugClient());
  const [items, setItems] = useState<BugReport[]>(ready?.page.items ?? []);
  const [cursor, setCursor] = useState<string | null>(ready?.page.next_cursor ?? null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(data.state === "not-set-up" ? data.message : null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [status, setStatus] = useState<BugStatus | "">("");
  const [priority, setPriority] = useState<BugPriority | "">("");
  const [scope, setScope] = useState<BugListScope>(ready?.initialScope ?? "reported");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(openId);
  const [browsing, setBrowsing] = useState(false);
  // The report the server rendered is used once; a report opened later loads its own.
  const [opened, setOpened] = useState(ready?.detail ?? null);
  const reads = useRef(0);
  const firstRun = useRef(data.state === "ready");
  const filters = useMemo(() => ({ status: status || null, priority: priority || null, q, ...bugScopeFilters(scope) }), [status, priority, q, scope]);

  const load = useCallback(
    async (quiet = false) => {
      const n = ++reads.current;
      if (!quiet) setLoading(true);
      setListError(null);
      try {
        const page = await client.list(filters);
        if (n !== reads.current) return;
        setItems(page.items);
        setCursor(page.next_cursor);
      } catch (e) {
        if (n === reads.current) setListError(errorText(e, "Bug reports did not load."));
      } finally {
        if (n === reads.current) setLoading(false);
      }
    },
    [client, filters],
  );
  // The server rendered the first page for the initial scope. A filter change reloads at once; typing in search waits a moment.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  const select = useCallback((id: string | null) => {
    setSelected(id);
    setBrowsing(id === null);
    setOpened(null);
    window.history.replaceState(null, "", bugPath(id));
  }, []);
  // Nothing chosen on a wide screen: the newest report shows (narrow screens show the list first), until Back.
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const shown = selected ?? (wide && !browsing ? (items[0]?.id ?? null) : null);

  async function loadMore() {
    if (!cursor) return;
    const n = reads.current;
    setMoreError(null);
    try {
      const page = await client.list({ ...filters, cursor });
      if (n !== reads.current) return;
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.next_cursor);
    } catch (e) {
      if (n === reads.current) setMoreError(errorText(e, "More reports did not load."));
    }
  }
  const changed = () => {
    void load(true);
    countsChanged();
  };

  const changeScope = (next: BugListScope) => {
    if (next === scope) return;
    ++reads.current;
    setScope(next);
    setItems([]);
    setCursor(null);
    setMoreError(null);
    setSelected(null);
    setOpened(null);
    setBrowsing(false);
    window.history.replaceState(null, "", bugPath());
  };

  const filtered = !!(q || status || priority);
  const card = (b: BugReport) => (
    <button key={b.id} type="button" className="bug-card" aria-current={b.id === shown || undefined} onClick={() => select(b.id)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a private image served by A10, not optimisable */}
      <img src={screenshotUrl(b.id)} alt="" loading="lazy" />
      <span className="bug-card-text">
        <b>
          {b.has_unread_reply && <i className="bug-dot" aria-label="New reply" />}
          {b.summary}
        </b>
        <small>
          {b.reporter.mine ? "You" : (b.reporter.name ?? "Someone")} · {relativeTime(b.created_at)}
        </small>
        <span className="bug-card-meta">
          <PriorityBadge priority={b.priority} />
          {b.assignee && <small>→ {b.assignee.name}</small>}
        </span>
      </span>
    </button>
  );

  return (
    <div className="bug-page" data-selected={!!shown || undefined}>
      <aside className="bug-list" aria-label="Bug reports">
        <div className="bug-filters">
          {isAdmin && (
            <div className="bug-seg" role="tablist" aria-label="Whose reports">
              {BUG_LIST_SCOPES.map((option) => (
                <button key={option} type="button" role="tab" aria-selected={scope === option} onClick={() => changeScope(option)}>
                  {BUG_SCOPE_LABEL[option]}
                </button>
              ))}
            </div>
          )}
          <div className="bug-chips" role="group" aria-label="Status">
            {(["", ...BUG_STATUSES] as const).map((s) => (
              <button key={s || "all"} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
                {s ? STATUS_LABEL[s] : "All"}
              </button>
            ))}
          </div>
          <div className="bug-filter-row">
            <label className="bug-search">
              <Search size={14} />
              <input aria-label="Search summaries" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <SearchSelect aria-label="Priority" value={priority} onChange={(next) => setPriority(next as BugPriority | "")}>
              <option value="">Any priority</option>
              {[...BUG_PRIORITIES].reverse().map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </SearchSelect>
            <button type="button" className="bug-icon" aria-label="Refresh" title="Refresh" onClick={() => void load()}>
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
        <div className="bug-list-scroll">
          {loading ? (
            <div className="bug-loading">
              <Loader2 className="bug-spin" />
              Loading reports…
            </div>
          ) : listError ? (
            <div className="bug-empty" role="alert">
              <Bug size={28} strokeWidth={1.4} />
              <p>{listError}</p>
              <button type="button" className="bug-btn" onClick={() => void load()}>
                Retry
              </button>
            </div>
          ) : !items.length ? (
            <div className="bug-empty">
              <Bug size={28} strokeWidth={1.4} />
              <p>
                {filtered
                  ? "No report matches these filters."
                  : scope === "assigned"
                    ? "No bugs are assigned to you."
                    : scope === "all"
                      ? "No bug reports yet."
                      : "You have not reported a problem yet. Use the bug button at the bottom right."}
              </p>
            </div>
          ) : status ? (
            <div className="bug-cards">{items.map(card)}</div>
          ) : (
            groupByStatus(items).map(([s, rows]) => (
              <section key={s} className="bug-group">
                <h3>
                  <i data-status={s} />
                  {STATUS_LABEL[s]}
                  <span>{rows.length}</span>
                </h3>
                <div className="bug-cards">{rows.map(card)}</div>
              </section>
            ))
          )}
          {cursor && !loading && !listError && (
            <button type="button" className="bug-btn bug-more" data-variant="ghost" onClick={() => void loadMore()}>
              Load more
            </button>
          )}
          {moreError && (
            <p className="bug-error" role="alert">
              {moreError}
            </p>
          )}
        </div>
      </aside>
      <section className="bug-detail-pane" aria-label="Report">
        {shown && ready ? (
          <BugDetailView
            key={shown}
            client={client}
            id={shown}
            initial={opened?.bug.id === shown ? opened : null}
            assignees={ready.assignees}
            onBack={() => select(null)}
            onChanged={changed}
          />
        ) : (
          <div className="bug-empty bug-empty-detail">
            <Bug size={36} strokeWidth={1.3} />
            <p>Choose a report to see its screenshot and messages.</p>
          </div>
        )}
      </section>
    </div>
  );
}
