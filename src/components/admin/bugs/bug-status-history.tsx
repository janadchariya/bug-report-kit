import { BUG_STATUS_LABELS } from "./bug-status-badge";
import type { BugReportStatusChange } from "@/lib/bugs/types";

type Props = {
  changes: BugReportStatusChange[];
  userLookup: Record<string, { fullName: string }>;
};

export function BugStatusHistory({ changes, userLookup }: Props) {
  if (changes.length === 0) {
    return <p className="text-xs text-slate-500">ยังไม่มีการเปลี่ยน status</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {changes.map((c) => (
        <li
          key={c.id}
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
        >
          <div className="text-xs text-slate-600">
            {new Date(c.createdAt).toLocaleString("th-TH")} —{" "}
            {userLookup[c.changedById]?.fullName ?? "—"}
          </div>
          <div>
            {c.fromStatus ? BUG_STATUS_LABELS[c.fromStatus] : "—"} →{" "}
            <strong>{BUG_STATUS_LABELS[c.toStatus]}</strong>
          </div>
          {c.note && <div className="mt-1 text-xs text-slate-700">{c.note}</div>}
        </li>
      ))}
    </ul>
  );
}
