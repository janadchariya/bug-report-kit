"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BUG_PRIORITY_LABELS } from "./bug-priority-badge";
import { BUG_STATUS_LABELS } from "./bug-status-badge";
import type { BugDetail } from "@/lib/bugs/get-bug";
import type { BugPriority, BugStatus } from "@/lib/bugs/types";

type AssignableUser = { id: string; fullName: string; role: string };

type Props = {
  detail: BugDetail;
  assignables: AssignableUser[];
  /** Called after a successful save. If omitted, falls back to router.refresh(). */
  onSaved?: () => void;
};

export function BugDetailEditor({ detail, assignables, onSaved }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<BugStatus>(detail.bug.status);
  const [priority, setPriority] = useState<BugPriority | "">(
    detail.bug.priority ?? "",
  );
  const [assignedToId, setAssignedToId] = useState<string>(
    detail.bug.assignedToId ?? "",
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    status !== detail.bug.status ||
    priority !== (detail.bug.priority ?? "") ||
    assignedToId !== (detail.bug.assignedToId ?? "");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bugs/${detail.bug.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          priority: priority === "" ? null : priority,
          assignedToId: assignedToId === "" ? null : assignedToId,
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message ?? "บันทึกไม่สำเร็จ");
      }
      setNote("");
      if (onSaved) {
        onSaved();
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">การจัดการ</h3>
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as BugStatus)}
          className="rounded-md border border-slate-300 px-2 py-1"
        >
          {(Object.keys(BUG_STATUS_LABELS) as BugStatus[]).map((s) => (
            <option key={s} value={s}>
              {BUG_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Priority
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as BugPriority | "")}
          className="rounded-md border border-slate-300 px-2 py-1"
        >
          <option value="">ยังไม่ตั้ง</option>
          {(Object.keys(BUG_PRIORITY_LABELS) as BugPriority[]).map((p) => (
            <option key={p} value={p}>
              {BUG_PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Assigned to
        <select
          value={assignedToId}
          onChange={(e) => setAssignedToId(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1"
        >
          <option value="">— ไม่กำหนด —</option>
          {assignables.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName} ({u.role})
            </option>
          ))}
        </select>
      </label>
      {status !== detail.bug.status && (
        <label className="flex flex-col gap-1 text-sm">
          Note (จะเก็บใน history)
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            className="rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>
    </div>
  );
}
