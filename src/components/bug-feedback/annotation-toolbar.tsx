"use client";

import type { ShapeColor } from "./lib/shapes";

export type ToolKind = "rect" | "ellipse" | "arrow" | "path";

type Props = {
  tool: ToolKind;
  color: ShapeColor;
  canUndo: boolean;
  zoom: number;
  onToolChange: (t: ToolKind) => void;
  onColorChange: (c: ShapeColor) => void;
  onUndo: () => void;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
};

const TOOLS: { kind: ToolKind; label: string }[] = [
  { kind: "rect", label: "▭ สี่เหลี่ยม" },
  { kind: "ellipse", label: "◯ วงกลม" },
  { kind: "arrow", label: "↗ ลูกศร" },
  { kind: "path", label: "✎ วาดอิสระ" },
];

const COLORS: ShapeColor[] = ["red", "yellow", "green"];
const COLOR_BG: Record<ShapeColor, string> = {
  red: "bg-red-600",
  yellow: "bg-yellow-500",
  green: "bg-green-600",
};

export function AnnotationToolbar({
  tool,
  color,
  canUndo,
  zoom,
  onToolChange,
  onColorChange,
  onUndo,
  onReset,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.kind}
            type="button"
            onClick={() => onToolChange(t.kind)}
            className={`rounded-md px-2 py-1 text-xs ${
              tool === t.kind
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mx-1 h-5 w-px bg-slate-300" />
      <div className="flex gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onColorChange(c)}
            aria-label={`สี ${c}`}
            className={`h-6 w-6 rounded-full ${COLOR_BG[c]} ${
              color === c ? "ring-2 ring-slate-900 ring-offset-1" : ""
            }`}
          />
        ))}
      </div>
      <div className="mx-1 h-5 w-px bg-slate-300" />
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="rounded-md bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
      >
        ↶ Undo
      </button>
      <button
        type="button"
        onClick={onReset}
        className="rounded-md bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
      >
        ⟲ เริ่มใหม่
      </button>
      <div className="mx-1 h-5 w-px bg-slate-300" />
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={zoom <= 0.5}
          aria-label="ย่อ"
          className="rounded-md bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          −
        </button>
        <button
          type="button"
          onClick={onZoomReset}
          title="รีเซ็ต zoom"
          className="min-w-[3rem] rounded-md bg-white px-2 py-1 text-center text-xs text-slate-700 hover:bg-slate-100"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          disabled={zoom >= 3}
          aria-label="ขยาย"
          className="rounded-md bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
