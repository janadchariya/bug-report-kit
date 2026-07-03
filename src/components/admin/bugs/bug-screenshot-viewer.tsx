"use client";

import { useState } from "react";

import { useDragToPan } from "@/lib/hooks/use-drag-to-pan";

export function BugScreenshotViewer({ bugId }: { bugId: string }) {
  const [zoom, setZoom] = useState(1);
  const { ref, grabbing, panProps } = useDragToPan<HTMLDivElement>();
  const src = `/api/bugs/${bugId}/screenshot`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
        >
          −
        </button>
        <span className="text-xs text-slate-600">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
        >
          Reset
        </button>
        <span className="text-[11px] text-slate-400">ลากในภาพเพื่อเลื่อนดู</span>
        <a
          href={src}
          download
          className="ml-auto rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
        >
          ดาวน์โหลด
        </a>
      </div>
      <div
        ref={ref}
        {...panProps}
        className={`max-h-[70vh] select-none overflow-auto rounded-md border border-slate-200 bg-slate-50 ${
          grabbing ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <img
          src={src}
          alt="bug screenshot"
          draggable={false}
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
          className="block"
        />
      </div>
    </div>
  );
}
