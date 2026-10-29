import type { BugPriority, BugStatus } from "@/src/domain/bugs";
import "./bug-badges.css";

export const BUG_STATUS_LABELS: Record<BugStatus, string> = { new: "New", in_progress: "In progress", done: "Done", cancelled: "Cancelled" };
export const BUG_PRIORITY_LABELS: Record<BugPriority, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
const statusColors: Record<BugStatus, string> = { new: "blue", in_progress: "amber", done: "green", cancelled: "grey" };
const priorityColors: Record<BugPriority, string> = { low: "grey", medium: "yellow", high: "orange", critical: "red" };
export function BugStatusBadge({ status }: { status: BugStatus }) {
  return <span className={`bugs-badge bugs-badge--${statusColors[status]}`}>{BUG_STATUS_LABELS[status]}</span>;
}
export function BugPriorityBadge({ priority }: { priority: BugPriority | null }) {
  return priority ? <span className={`bugs-badge bugs-badge--${priorityColors[priority]}${priority === "high" ? " bugs-badge--ring" : ""}`}>{BUG_PRIORITY_LABELS[priority]}</span> : <span className="bugs-priority-empty">ยังไม่ตั้ง</span>;
}
