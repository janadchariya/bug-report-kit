"use client";

// Screenshot + drawing layer (bug-report-kit annotation-canvas.tsx, old PR #2 AnnotationCanvas.tsx). The canvases keep the screenshot's native pixels;
// CSS scales them to the dialog and pointer positions are mapped back, so the uploaded image is full resolution.
import { useEffect, useRef, type PointerEvent } from "react";
import { drawShape, drawShapes, type Shape, type ShapeColor } from "../lib/shapes";

export type ToolKind = 'rect' | 'ellipse' | 'arrow' | 'path';

type Props = { screenshot: HTMLCanvasElement; tool: ToolKind; color: ShapeColor; shapes: Shape[]; zoom: number; onCommitShape: (s: Shape) => void };

export function AnnotationCanvas({ screenshot, tool, color, shapes, zoom, onCommitShape }: Props) {
  const bgRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<Shape | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const bg = bgRef.current;
    if (!bg) return;
    bg.width = screenshot.width;
    bg.height = screenshot.height;
    bg.getContext('2d')?.drawImage(screenshot, 0, 0);
  }, [screenshot]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.width = screenshot.width;
    fg.height = screenshot.height;
    const ctx = fg.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, fg.width, fg.height);
    drawShapes(ctx, shapes);
  }, [shapes, screenshot]);

  function pointFor(e: PointerEvent<HTMLCanvasElement>) {
    const fg = fgRef.current!;
    const rect = fg.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (fg.width / rect.width), y: (e.clientY - rect.top) * (fg.height / rect.height) };
  }
  function paintDraft() {
    const fg = fgRef.current;
    const ctx = fg?.getContext('2d');
    if (!fg || !ctx) return;
    ctx.clearRect(0, 0, fg.width, fg.height);
    drawShapes(ctx, shapes);
    if (draftRef.current) drawShape(ctx, draftRef.current);
  }
  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    const p = pointFor(e);
    draftRef.current = tool === 'path' ? { kind: 'path', color, points: [p] } : { kind: tool, color, a: p, b: p };
    paintDraft();
  }
  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const d = draftRef.current;
    if (!drawingRef.current || !d) return;
    const p = pointFor(e);
    if (d.kind === 'path') d.points.push(p); else d.b = p;
    paintDraft();
  }
  function onPointerUp() {
    const shape = draftRef.current;
    if (!drawingRef.current || !shape) return;
    drawingRef.current = false;
    draftRef.current = null;
    // Accidental clicks (a drag under 3 px, a one-point line) draw nothing.
    const tiny = shape.kind === 'path' ? shape.points.length < 2 : Math.abs(shape.b.x - shape.a.x) < 3 && Math.abs(shape.b.y - shape.a.y) < 3;
    if (tiny) { paintDraft(); return; }
    onCommitShape(shape);
  }

  // The inner box owns width (zoom) and aspect ratio; both canvases fill it exactly, which keeps Safari's
  // getBoundingClientRect() in step with the drawing (kit note: annotation drift).
  return (
    <div className="bug-canvas-scroll">
      <div className="bug-canvas-box" style={{ width: `${Math.round(zoom * 100)}%`, aspectRatio: `${screenshot.width}/${screenshot.height}` }}>
        <canvas ref={bgRef} className="bug-canvas" aria-hidden="true"/>
        <canvas ref={fgRef} className="bug-canvas bug-canvas-draw" aria-label="Screenshot: drag to mark the problem" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}/>
      </div>
    </div>
  );
}
