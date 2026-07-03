"use client";

import { BugPriorityBadge } from "./bug-priority-badge";
import type { BugListItem } from "@/lib/bugs/types";

type Props = {
  bug: BugListItem;
  selected: boolean;
  onSelect: () => void;
};

/**
 * Compact card for the right-column bug list in the split view. Click selects
 * the bug; the detail column on the left then renders its full content.
 */
export function BugCard({ bug, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full gap-2 rounded-md border p-2 text-left transition ${
        selected
          ? "border-[var(--primary)] bg-[var(--nav-active-bg)] shadow-sm"
          : "border-[var(--border)] bg-white hover:bg-[var(--nav-hover-bg)] hover:border-[var(--border)]"
      }`}
    >
      <img
        src={`/api/bugs/${bug.id}/screenshot`}
        alt=""
        className="h-14 w-20 flex-shrink-0 rounded object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-sm font-medium text-slate-900">
          {bug.summary}
        </div>
        <div className="line-clamp-1 text-xs text-slate-500">
          {bug.reporter.fullName} · {bug.company.name}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <BugPriorityBadge priority={bug.priority} />
          <span className="text-xs text-slate-400">
            {formatRelative(bug.createdAt)}
          </span>
        </div>
      </div>
    </button>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "เมื่อกี้";
  if (mins < 60) return `${mins} น.`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชม.`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} ว.`;
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
  });
}
