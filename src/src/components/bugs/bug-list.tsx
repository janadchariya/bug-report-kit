"use client";
/* eslint-disable @next/next/no-img-element -- Private no-store images must use the authenticated route directly, never an image optimizer. */

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { bugListUrl, type BugFilters } from "@/app/(app)/bugs/filters";
import { ImageOff } from "lucide-react";
import type { BugListItem } from "@/src/lib/bugs/types";
import { formatBugRelativeTime, groupBugList } from "@/src/lib/bugs/list";
import { formatBangkokDate } from "@/src/lib/locale-time";
import { BUG_STATUS_LABELS, BugPriorityBadge, BugStatusBadge } from "./bug-badges";
import "./bug-list.css";

type Props = { items: BugListItem[]; scope: "mine" | "triage"; selectedId?: string; filters: BugFilters; nextCursor: string | null };
export function BugList(props: Props) {
  // Selection leaves the list instance intact; a changed filter starts a fresh cursor chain.
  return <BugListContent key={bugListUrl(props.scope, props.filters)} {...props} />;
}
function BugListContent({ items, scope, selectedId, filters, nextCursor }: Props) {
  const selectionUrl = bugListUrl(scope, filters, selectedId);
  useEffect(() => {
    if (scope === "triage" && selectedId && window.location.pathname === "/bugs" && !new URLSearchParams(window.location.search).has("selected")) {
      window.history.replaceState(window.history.state, "", selectionUrl);
    }
  }, [scope, selectedId, selectionUrl]);
  const [page, setPage] = useState({ source: items, selectedId, loaded: [] as BugListItem[], cursor: nextCursor, loadedPage: false, busy: false, failed: false, generation: 0 });
  if (page.source !== items || page.selectedId !== selectedId) {
    // Keep the entire loaded range on selection: new reports can push boundary rows
    // out of items while pagination still continues after the already-loaded tail.
    // A refresh of the same report discards cached private cards and pending reads.
    const refresh = page.source !== items && page.selectedId === selectedId;
    const priorHeadIds = new Set(page.source.map((row) => row.id));
    setPage({ ...page, source: items, selectedId, ...(refresh
      ? { loaded: [], cursor: nextCursor, loadedPage: false, busy: false, failed: false, generation: page.generation + 1 }
      : { loaded: [...page.source, ...page.loaded.filter((row) => !priorHeadIds.has(row.id))] }) });
  }
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const rows = [...items, ...page.loaded.filter((row) => !items.some((item) => item.id === row.id))];
  const shownCursor = page.loadedPage ? page.cursor : nextCursor;
  async function loadMore(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (page.busy || !shownCursor) return;
    const generation = page.generation;
    setPage((prior) => ({ ...prior, busy: true, failed: false }));
    try {
      const url = bugListUrl("triage", { ...filters, cursor: shownCursor }).replace("/bugs", "/api/bugs") + (scope === "mine" ? "&scope=mine" : "");
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("load_failed");
      const result = await response.json() as { items: BugListItem[]; nextCursor: string | null };
      if (!alive.current) return;
      setPage((prior) => prior.generation !== generation ? prior : {
        ...prior, loaded: [...prior.loaded, ...result.items.filter((row) => !prior.loaded.some((item) => item.id === row.id))],
        cursor: result.nextCursor, loadedPage: true, busy: false,
      });
    } catch {
      if (alive.current) setPage((prior) => prior.generation !== generation ? prior : { ...prior, busy: false, failed: true });
    }
  }
  const cards = (group: BugListItem[]) => <ul className={scope === "mine" ? "bugs-mine-list" : undefined}>{group.map((item) => <li key={item.id}>
    <Link className={scope === "mine" ? "bugs-mine-list__item" : "bugs-list__item"} href={bugListUrl(scope, filters, item.id)} scroll={false} aria-current={item.id === selectedId ? "page" : undefined}>
      {scope === "triage" ? item.screenshotImageId ? <img className="bugs-list__thumbnail" src={`/api/bugs/images/${item.screenshotImageId}`} alt="" width={80} height={56} loading="lazy" decoding="async" /> : <span className="bugs-list__thumbnail bugs-list__thumbnail--placeholder" aria-hidden="true"><ImageOff size={20} /></span> : null}
      {scope === "mine" ? <>
        <span className="bugs-mine-list__content"><span className="bugs-mine-list__summary">{item.unread ? <span className="bugs-mine-list__unread" role="img" aria-label="Unread"><span className="sr-only">Unread</span></span> : null}<span>{item.summary}</span></span><time dateTime={item.createdAt}>{formatBangkokDate(new Date(item.createdAt))}</time></span>
        <BugStatusBadge status={item.status} />
      </> : <span className="bugs-list__content">
        <strong className="bugs-list__summary">{item.summary}</strong>
        <span className="bugs-list__reporter">{item.reporter?.nickname ?? item.reporter?.displayName ?? "ผู้รายงาน"}</span>
        <span className="bugs-list__footer"><BugPriorityBadge priority={item.priority} />{item.hasPdf ? <span className="bugs-list__pdf">PDF</span> : null}<time dateTime={item.createdAt} suppressHydrationWarning>{formatBugRelativeTime(item.createdAt)}</time></span>
      </span>}
    </Link>
  </li>)}</ul>;
  return <nav className={scope === "mine" ? "bugs-list bugs-list--mine" : "bugs-list"} aria-label="Bug reports">
    {!rows.length ? <p className="bugs-empty">ยังไม่มีรายงานที่ตรงกับตัวกรอง</p> : scope === "triage" && !filters.status ? <div className="bugs-list__groups">
      {groupBugList(rows).map((group) => <section className="bugs-list__group" key={group.status}>
        <h3 className="bugs-list__group-title"><span className={`bugs-list__status-dot bugs-list__status-dot--${group.status}`} aria-hidden="true" />{BUG_STATUS_LABELS[group.status]}<span>({group.items.length})</span></h3>{cards(group.items)}
      </section>)}
    </div> : cards(rows)}
    {page.failed ? <p role="alert" className="bugs-list__error">โหลดรายงานไม่สำเร็จ กรุณาลองอีกครั้ง</p> : null}
    {shownCursor ? <div className="bugs-list__more"><Link className="bugs-list__load-more" href={bugListUrl(scope, { ...filters, cursor: shownCursor })} onClick={loadMore} aria-disabled={page.busy}>{page.busy ? "Loading…" : "Load more"}</Link></div> : null}
  </nav>;
}
