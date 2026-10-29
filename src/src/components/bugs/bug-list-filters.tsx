"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { bugListUrl, parseBugFilters, type BugFilters } from "@/app/(app)/bugs/filters";
import { BUG_PRIORITIES, BUG_STATUSES } from "@/src/domain/bugs";
import type { BugStaff } from "@/src/lib/bugs/types";
import { BUG_PRIORITY_LABELS, BUG_STATUS_LABELS } from "./bug-badges";
import "./bug-list-filters.css";

export function BugListFilters({ filters, triagers, selectedId }: { filters: BugFilters; triagers: BugStaff[]; selectedId?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState({ source: filters.status, value: filters.status });
  if (status.source !== filters.status) setStatus({ source: filters.status, value: filters.status });
  const [searchFocused, setSearchFocused] = useState(false);
  const [query, setQuery] = useState({ source: filters.q, value: filters.q ?? "", deferred: false });
  if (query.source !== filters.q) {
    setQuery({ source: filters.q, value: searchFocused ? query.value : filters.q ?? "", deferred: searchFocused });
  }
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);
  function cancelDebounce() {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = null;
  }
  function navigate(status?: typeof filters.status, changeStatus = false) {
    cancelDebounce();
    if (!form.current || !form.current.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form.current).entries()) as Record<string, string>;
    const changed = parseBugFilters(values);
    if (changeStatus) { changed.status = status; setStatus({ source: filters.status, value: status }); }
    startTransition(() => router.replace(bugListUrl("triage", changed, values.selected || undefined), { scroll: false }));
  }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (event.type === "change" && event.target === search.current) return;
    navigate();
  }
  return <form ref={form} action="/bugs" method="get" className="bugs-list-filters" data-pending={pending} data-refresh-navigation aria-label="Bug filters" onChange={apply} onSubmit={apply}>
    <nav className="bugs-list-filters__statuses" aria-label="Status filters">
      {[undefined, ...BUG_STATUSES].map((status) => <Link key={status ?? "all"} className="bugs-list-filters__status" href={bugListUrl("triage", { ...filters, status, cursor: undefined }, selectedId)} scroll={false} aria-current={filters.status === status ? "page" : undefined} onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); navigate(status, true);
      }}>{status ? BUG_STATUS_LABELS[status] : "All"}</Link>)}
    </nav>
    <input type="hidden" name="status" value={status.value ?? ""} />
    {selectedId ? <input type="hidden" name="selected" value={selectedId} /> : null}
    <div className="bugs-list-filters__selects">
      <select aria-label="Priority" name="priority" defaultValue={filters.priority === null ? "none" : filters.priority ?? ""} key={`priority:${filters.priority}`}>
        <option value="">All priorities</option><option value="none">No priority</option>
        {[...BUG_PRIORITIES].reverse().map((priority) => <option key={priority} value={priority}>{BUG_PRIORITY_LABELS[priority]}</option>)}
      </select>
      <select aria-label="Assignee" name="assignee" defaultValue={filters.assigneeId === null ? "unassigned" : filters.assigneeId ?? ""} key={`assignee:${filters.assigneeId}`}>
        <option value="">All assignees</option><option value="unassigned">Unassigned</option>
        {triagers.map((person) => <option key={person.id} value={person.id}>{person.nickname ?? person.displayName}</option>)}
      </select>
    </div>
    <input aria-label="Search summary" type="search" name="q" ref={search} value={query.value} onFocus={() => setSearchFocused(true)} onBlur={() => {
      setSearchFocused(false);
      if (query.deferred) setQuery({ source: filters.q, value: filters.q ?? "", deferred: false });
    }} onChange={(event) => {
      setQuery({ source: filters.q, value: event.target.value, deferred: false });
      cancelDebounce(); debounce.current = setTimeout(() => navigate(), 300);
    }} placeholder="Search summary…" maxLength={100} />
    {pending ? <p className="bugs-helper" role="status">กำลังโหลด…</p> : null}
    <noscript><button type="submit">Apply filters</button></noscript>
  </form>;
}
