"use client";

import { useState } from "react";

type Props = {
  submitting: boolean;
  error: string | null;
  /** Whether the user has attached a screenshot. Submit is disabled when false. */
  hasImage: boolean;
  /** OS-aware shortcut hint, shown when no image is attached yet. */
  shortcut: string;
  onSubmit: (values: { summary: string; description: string | null }) => void;
  onCancel: () => void;
};

export function BugForm({ submitting, error, hasImage, shortcut, onSubmit, onCancel }: Props) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);

  const summaryValid = summary.trim().length > 0 && summary.length <= 200;
  const canSubmit = summaryValid && hasImage && !submitting;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      summary: summary.trim(),
      description: description.trim() ? description.trim() : null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate-900">
          รายละเอียดสั้นๆ <span className="text-red-600">*</span>
        </span>
        <input
          autoFocus
          type="text"
          maxLength={200}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="เช่น ปุ่ม Submit กดไม่ได้"
          className="rounded-md border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none"
          disabled={submitting}
        />
        <span className="text-xs text-slate-500">{summary.length}/200</span>
      </label>

      {!showDescription ? (
        <button
          type="button"
          onClick={() => setShowDescription(true)}
          className="self-start text-sm text-slate-600 underline hover:text-slate-900"
        >
          + เพิ่มรายละเอียด (ถ้ามี)
        </button>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-700">รายละเอียดเพิ่มเติม</span>
          <textarea
            rows={4}
            maxLength={4000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            disabled={submitting}
          />
          <span className="text-xs text-slate-500">{description.length}/4000</span>
        </label>
      )}

      <p className="text-xs text-slate-500">
        ภาพหน้าจอจะถูกส่งไปยังทีมงานเพื่อใช้แก้ปัญหา
      </p>

      {!hasImage && (
        <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          ยังไม่มีภาพ — แคปด้วย {shortcut} แล้ววางตรงนี้ (⌘/Ctrl+V)
        </p>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "กำลังส่ง…" : "ส่ง"}
        </button>
      </div>
    </form>
  );
}
