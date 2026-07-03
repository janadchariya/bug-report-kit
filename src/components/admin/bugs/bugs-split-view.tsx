"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BUG_STATUS_LABELS } from "./bug-status-badge";
import { BugCard } from "./bug-card";
import { BugDetailColumn } from "./bug-detail-column";
import type { BugListItem, BugStatus } from "@/lib/bugs/types";

export type AssignableUser = {
  id: string;
  fullName: string;
  role: string;
  companyId: string;
};

type Props = {
  initial: { items: BugListItem[]; nextCursor: string | null };
  companies: { id: string; name: string }[];
  assignables: AssignableUser[];
  currentUserId: string;
};

const STATUS_FILTERS: { value: BugStatus | ""; label: string }[] = [
  { value: "", label: "ทั้งหมด" },
  { value: "new", label: "ใหม่" },
  { value: "in_progress", label: "กำลังดำเนินการ" },
  { value: "done", label: "เสร็จแล้ว" },
  { value: "cancelled", label: "ยกเลิก" },
];

const STATUS_ORDER: BugStatus[] = ["new", "in_progress", "done", "cancelled"];

const STATUS_DOT_COLOR: Record<BugStatus, string> = {
  new: "bg-blue-500",
  in_progress: "bg-amber-500",
  done: "bg-emerald-500",
  cancelled: "bg-slate-400",
};

/**
 * Top-level master-detail view for /admin/bugs. Left: full detail panel of
 * the selected bug. Right: filterable, grouped, scrollable list. Selection
 * is reflected in the URL (?selected=<id>) so back/forward and direct
 * links work.
 */
export function BugsSplitView({ initial, companies, assignables, currentUserId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedFromUrl = searchParams.get("selected");

  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [status, setStatus] = useState<string>("");
  const [priority, setPriority] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-select first bug if URL has no selection but the list isn't empty.
  // Wrap in useEffect so the initial render doesn't push a navigation before
  // hydration completes.
  useEffect(() => {
    if (!selectedFromUrl && items.length > 0) {
      const params = new URLSearchParams(searchParams);
      params.set("selected", items[0].id);
      router.replace(`/admin/bugs?${params.toString()}`, { scroll: false });
    }
    // We intentionally don't depend on selectedFromUrl here — only run when
    // items first arrive. Subsequent selection is user-driven via selectBug().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length === 0]);

  function selectBug(id: string) {
    const params = new URLSearchParams(searchParams);
    params.set("selected", id);
    router.replace(`/admin/bugs?${params.toString()}`, { scroll: false });
  }

  // Refetch list whenever any filter changes.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (companyId) params.set("companyId", companyId);
    if (q.trim()) params.set("q", q.trim());
    params.set("limit", "100");
    setLoading(true);
    fetch(`/api/bugs?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok) return;
        setItems(json.data.items);
        setCursor(json.data.nextCursor);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status, priority, companyId, q]);

  async function loadMore() {
    if (!cursor) return;
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (companyId) params.set("companyId", companyId);
    if (q.trim()) params.set("q", q.trim());
    params.set("cursor", cursor);
    params.set("limit", "100");
    const res = await fetch(`/api/bugs?${params.toString()}`);
    const json = await res.json();
    if (!json.ok) return;
    setItems((prev) => [...prev, ...json.data.items]);
    setCursor(json.data.nextCursor);
  }

  // Called after a save in the detail editor — refetch the list so the card
  // on the right reflects the new status/priority/assignee.
  async function refetchList() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (companyId) params.set("companyId", companyId);
    if (q.trim()) params.set("q", q.trim());
    params.set("limit", "100");
    const res = await fetch(`/api/bugs?${params.toString()}`);
    const json = await res.json();
    if (json?.ok) {
      setItems(json.data.items);
      setCursor(json.data.nextCursor);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<BugStatus, BugListItem[]>();
    for (const b of items) {
      const arr = map.get(b.status) ?? [];
      arr.push(b);
      map.set(b.status, arr);
    }
    return map;
  }, [items]);

  const showGrouped = status === "";

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-3 lg:grid-cols-[1fr_360px]">
      {/* Left — detail */}
      <div className="order-2 min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 lg:order-1">
        <BugDetailColumn
          bugId={selectedFromUrl}
          assignables={assignables}
          companies={companies}
          onBugUpdated={refetchList}
          currentUserId={currentUserId}
        />
      </div>

      {/* Right — list */}
      <div className="order-1 flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white lg:order-2">
        {/* Filters */}
        <div className="space-y-2 border-b border-slate-200 p-3">
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatus(f.value)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  status === f.value
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="">ทุก priority</option>
              <option value="critical">ด่วนมาก</option>
              <option value="high">สูง</option>
              <option value="medium">ปานกลาง</option>
              <option value="low">ต่ำ</option>
            </select>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="">ทุก company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้น summary…"
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading && (
            <p className="py-3 text-center text-xs text-slate-500">
              กำลังโหลด…
            </p>
          )}
          {!loading && items.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              ไม่มี bug ตาม filter
            </p>
          )}
          {!loading && items.length > 0 && (
            <div className="space-y-4">
              {showGrouped
                ? STATUS_ORDER.map((s) => {
                    const rows = grouped.get(s) ?? [];
                    if (rows.length === 0) return null;
                    return (
                      <div key={s} className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-600">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_COLOR[s]}`}
                          />
                          {BUG_STATUS_LABELS[s]}
                          <span className="text-slate-400">({rows.length})</span>
                        </div>
                        <div className="space-y-2">
                          {rows.map((b) => (
                            <BugCard
                              key={b.id}
                              bug={b}
                              selected={b.id === selectedFromUrl}
                              onSelect={() => selectBug(b.id)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })
                : (
                  <div className="space-y-2">
                    {items.map((b) => (
                      <BugCard
                        key={b.id}
                        bug={b}
                        selected={b.id === selectedFromUrl}
                        onSelect={() => selectBug(b.id)}
                      />
                    ))}
                  </div>
                )}
            </div>
          )}
          {cursor && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={loadMore}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
              >
                โหลดเพิ่ม
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
