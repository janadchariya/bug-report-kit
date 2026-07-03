import type { BugStatus } from "@/lib/bugs/types";

const STYLES: Record<BugStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-600",
};

const LABELS: Record<BugStatus, string> = {
  new: "ใหม่",
  in_progress: "กำลังดำเนินการ",
  done: "เสร็จแล้ว",
  cancelled: "ยกเลิก",
};

export function BugStatusBadge({ status }: { status: BugStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}

export const BUG_STATUS_LABELS = LABELS;
