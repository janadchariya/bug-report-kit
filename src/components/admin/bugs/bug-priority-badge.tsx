import type { BugPriority } from "@/lib/bugs/types";

const STYLES: Record<BugPriority, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const LABELS: Record<BugPriority, string> = {
  low: "ต่ำ",
  medium: "ปานกลาง",
  high: "สูง",
  critical: "ด่วนมาก",
};

export function BugPriorityBadge({ priority }: { priority: BugPriority | null }) {
  if (!priority) {
    return <span className="text-xs text-slate-400">ยังไม่ตั้ง</span>;
  }
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[priority]}`}
    >
      {LABELS[priority]}
    </span>
  );
}

export const BUG_PRIORITY_LABELS = LABELS;
