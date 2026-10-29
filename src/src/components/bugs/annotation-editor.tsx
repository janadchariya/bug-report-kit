"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/src/components/ui/button";
import { resolveAnnotationColors, type AnnotationShape, type AnnotationTool, type ShapeColor } from "@/src/lib/bugs/annotation";
import { exportAnnotatedImage } from "@/src/lib/bugs/prepare-image";
import { usesCoarsePointer } from "@/src/lib/bugs/report-dialog";
import { AnnotationCanvas } from "./annotation-canvas";
import { AnnotationToolbar } from "./annotation-toolbar";
import "./bug-images.css";

export function AnnotationEditor({ source, shapes, onShapesChange, onApply, onCancel, disabled = false, onBusyChange }: {
  source: HTMLCanvasElement; shapes: readonly AnnotationShape[];
  onShapesChange: (shapes: AnnotationShape[]) => void; onApply: (blob: Blob) => void; onCancel: () => void;
  disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const generation = useRef(0);
  const [tool, setTool] = useState<AnnotationTool | null>(() => usesCoarsePointer() ? null : "rect");
  const [color, setColor] = useState<ShapeColor>("red");
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    editor.current?.focus();
    return () => { generation.current += 1; };
  }, []);

  function shortcut(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || busy || (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))) return;
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "z") { event.preventDefault(); onShapesChange(shapes.slice(0, -1)); }
    else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === "+" || event.key === "=") { event.preventDefault(); setZoom((value) => Math.min(3, value + 0.25)); }
      else if (event.key === "-") { event.preventDefault(); setZoom((value) => Math.max(0.5, value - 0.25)); }
      else if (event.key === "0") { event.preventDefault(); setZoom(1); }
    }
  }
  async function apply() {
    if (disabled || pending.current || !editor.current) return;
    const token = generation.current;
    pending.current = true; setBusy(true); onBusyChange?.(true); setError(null);
    try { const blob = await exportAnnotatedImage(source, shapes, resolveAnnotationColors(editor.current)); if (generation.current === token) onApply(blob); }
    catch (failure) { if (generation.current === token) setError(failure instanceof Error ? failure.message : "บันทึกรูปไม่ได้ กรุณาลองอีกครั้ง"); }
    finally { if (generation.current === token) { pending.current = false; setBusy(false); onBusyChange?.(false); } }
  }

  return <div ref={editor} role="region" aria-label="Annotation editor" className="bug-annotation" tabIndex={0} onKeyDown={shortcut}>
    <AnnotationToolbar tool={tool} color={color} canUndo={shapes.length > 0} zoom={zoom} disabled={disabled || busy} onToolChange={setTool} onColorChange={setColor} onUndo={() => onShapesChange(shapes.slice(0, -1))} onClear={() => onShapesChange([])} onZoomChange={setZoom} />
    {usesCoarsePointer() ? <p className="bug-image__hint">เลือกเครื่องมือแล้วลากเพื่อทำเครื่องหมาย กดเครื่องมือที่เลือกซ้ำเพื่อเลื่อนภาพ ใช้ Undo หรือ Start over เพื่อลบเฉพาะเครื่องหมาย ภาพต้นฉบับยังอยู่</p> : null}
    <AnnotationCanvas screenshot={source} shapes={shapes} tool={tool} color={color} zoom={zoom} disabled={disabled || busy} onCommitShape={(shape) => onShapesChange([...shapes, shape])} />
    {error ? <p role="alert" className="bug-image__error">{error}</p> : null}
    <div className="bug-image__actions"><Button disabled={disabled || busy} onClick={onCancel}>Cancel annotation</Button><Button variant="primary" disabled={disabled || busy} onClick={() => void apply()}>{busy ? "Preparing image…" : "Apply annotation"}</Button></div>
  </div>;
}
