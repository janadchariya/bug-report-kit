"use client";

import { useState, type KeyboardEvent } from "react";
import type { AnnotationTool, ShapeColor } from "@/src/lib/bugs/annotation";
import { usesCoarsePointer } from "@/src/lib/bugs/report-dialog";
import "./bug-images.css";

export interface AnnotationToolbarProps {
  tool: AnnotationTool | null;
  color: ShapeColor;
  canUndo: boolean;
  zoom: number;
  disabled?: boolean;
  onToolChange: (tool: AnnotationTool | null) => void;
  onColorChange: (color: ShapeColor) => void;
  onUndo: () => void;
  onClear: () => void;
  onZoomChange: (zoom: number) => void;
}

const tools = [
  { kind: "rect", glyph: "▭", label: "Rectangle" },
  { kind: "ellipse", glyph: "◯", label: "Ellipse" },
  { kind: "arrow", glyph: "↗", label: "Arrow" },
  { kind: "path", glyph: "✎", label: "Freehand" },
] as const;

export function AnnotationToolbar({ tool, color, canUndo, zoom, disabled = false, onToolChange, onColorChange, onUndo, onClear, onZoomChange }: AnnotationToolbarProps) {
  const [focusedControl, setFocusedControl] = useState("rect");
  const enabledControls = disabled ? [] : ["rect", "ellipse", "arrow", "path", "red", "yellow", "green", ...(canUndo ? ["undo", "clear"] : []), ...(zoom > 0.5 ? ["zoom-out"] : []), "zoom-reset", ...(zoom < 3 ? ["zoom-in"] : [])];
  const tabStop = enabledControls.includes(focusedControl) ? focusedControl : enabledControls[0];
  function rovingTab(id: string) {
    return { tabIndex: id === tabStop ? 0 : -1, onFocus: () => setFocusedControl(id) };
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next].focus();
  }
  return <div className="bug-annotation__toolbar" role="toolbar" aria-label="Annotation tools" onKeyDown={navigate}>
    <div className="bug-annotation__group">
      {tools.map((item) => <button key={item.kind} type="button" {...rovingTab(item.kind)} className="bug-annotation__chip" aria-label={item.label} aria-pressed={tool === item.kind} disabled={disabled} onClick={() => onToolChange(usesCoarsePointer() && tool === item.kind ? null : item.kind)}><span aria-hidden="true">{item.glyph}</span> {item.label}</button>)}
    </div>
    <span className="bug-annotation__separator" aria-hidden="true" />
    <div className="bug-annotation__group">
      {(["red", "yellow", "green"] as const).map((item) => <button key={item} type="button" {...rovingTab(item)} className="bug-annotation__color" aria-label={item[0].toUpperCase() + item.slice(1)} aria-pressed={color === item} disabled={disabled} onClick={() => onColorChange(item)}><span className={`bug-annotation__swatch bug-annotation__swatch--${item}`} aria-hidden="true" /></button>)}
    </div>
    <span className="bug-annotation__separator" aria-hidden="true" />
    <button type="button" {...rovingTab("undo")} className="bug-annotation__chip" aria-label="Undo" disabled={disabled || !canUndo} onClick={onUndo}><span aria-hidden="true">↶</span> Undo</button>
    <button type="button" {...rovingTab("clear")} className="bug-annotation__chip" aria-label="Start over" disabled={disabled || !canUndo} onClick={() => { if (window.confirm("ล้างเครื่องหมายทั้งหมดแล้วเริ่มใหม่หรือไม่?")) onClear(); }}><span aria-hidden="true">⟲</span> Start over</button>
    <span className="bug-annotation__separator" aria-hidden="true" />
    <div className="bug-annotation__group">
      <button type="button" {...rovingTab("zoom-out")} className="bug-annotation__chip" aria-label="Zoom out" disabled={disabled || zoom <= 0.5} onClick={() => onZoomChange(Math.max(0.5, zoom - 0.25))}>−</button>
      <button type="button" {...rovingTab("zoom-reset")} className="bug-annotation__chip bug-annotation__zoom" aria-label={`Reset zoom (${Math.round(zoom * 100)}%)`} title="Reset zoom" disabled={disabled} onClick={() => onZoomChange(1)}>{Math.round(zoom * 100)}%</button>
      <button type="button" {...rovingTab("zoom-in")} className="bug-annotation__chip" aria-label="Zoom in" disabled={disabled || zoom >= 3} onClick={() => onZoomChange(Math.min(3, zoom + 0.25))}>+</button>
    </div>
  </div>;
}
