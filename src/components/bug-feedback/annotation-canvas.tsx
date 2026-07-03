"use client";

import { useEffect, useRef } from "react";

import {
  drawShape,
  drawShapes,
  type Shape,
  type ShapeColor,
} from "./lib/shapes";
import type { ToolKind } from "./annotation-toolbar";

type Props = {
  screenshot: HTMLCanvasElement;
  tool: ToolKind;
  color: ShapeColor;
  shapes: Shape[];
  zoom: number;
  onCommitShape: (s: Shape) => void;
};

/**
 * Renders the screenshot to a canvas and overlays a transparent drawing
 * layer at the same pixel resolution. The displayed size is scaled down
 * (CSS) so the modal stays inside the viewport, but all coordinates are
 * mapped back to the screenshot's native pixels — the eventual PNG goes
 * out at full resolution.
 */
export function AnnotationCanvas({
  screenshot,
  tool,
  color,
  shapes,
  zoom,
  onCommitShape,
}: Props) {
  const bgRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<Shape | null>(null);
  const drawingRef = useRef(false);

  // Paint screenshot once.
  useEffect(() => {
    const bg = bgRef.current;
    if (!bg) return;
    bg.width = screenshot.width;
    bg.height = screenshot.height;
    const ctx = bg.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(screenshot, 0, 0);
  }, [screenshot]);

  // Re-paint committed shapes whenever the array changes.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.width = screenshot.width;
    fg.height = screenshot.height;
    const ctx = fg.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, fg.width, fg.height);
    drawShapes(ctx, shapes);
  }, [shapes, screenshot]);

  function pointFor(e: React.PointerEvent<HTMLCanvasElement>) {
    const fg = fgRef.current!;
    const rect = fg.getBoundingClientRect();
    const scaleX = fg.width / rect.width;
    const scaleY = fg.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = pointFor(e);
    if (tool === "path") {
      draftRef.current = { kind: "path", color, points: [p] };
    } else {
      draftRef.current = { kind: tool, color, a: p, b: p };
    }
    paintDraft();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !draftRef.current) return;
    const p = pointFor(e);
    const d = draftRef.current;
    if (d.kind === "path") {
      d.points.push(p);
    } else {
      d.b = p;
    }
    paintDraft();
  }

  function onPointerUp() {
    if (!drawingRef.current || !draftRef.current) return;
    drawingRef.current = false;
    const shape = draftRef.current;
    draftRef.current = null;
    // Discard degenerate drags (e.g. accidental clicks).
    if (shape.kind !== "path") {
      const dx = Math.abs(shape.b.x - shape.a.x);
      const dy = Math.abs(shape.b.y - shape.a.y);
      if (dx < 3 && dy < 3) {
        paintDraft();
        return;
      }
    } else if (shape.points.length < 2) {
      paintDraft();
      return;
    }
    onCommitShape(shape);
  }

  function paintDraft() {
    const fg = fgRef.current;
    if (!fg) return;
    const ctx = fg.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, fg.width, fg.height);
    drawShapes(ctx, shapes);
    if (draftRef.current) drawShape(ctx, draftRef.current);
  }

  return (
    <div className="relative h-full max-h-full w-full overflow-auto">
      {/*
       * The inner div owns the layout: its width drives zoom and its
       * aspect-ratio (set from the screenshot dimensions at first render)
       * anchors the height. Both canvases then use absolute inset-0 +
       * w-full/h-full so they always fill the div exactly — this avoids
       * relying on canvas "height:auto" or "inset-0 stretch" behaviour
       * which Safari handles differently for replaced elements, causing
       * getBoundingClientRect() to return wrong dimensions and making
       * pointFor() compute incorrect scale factors (annotation drift).
       */}
      <div
        className="relative"
        style={{
          width: `${Math.round(zoom * 100)}%`,
          aspectRatio: `${screenshot.width}/${screenshot.height}`,
        }}
      >
        <canvas
          ref={bgRef}
          className="absolute inset-0 h-full w-full"
          style={{ touchAction: "none" }}
        />
        <canvas
          ref={fgRef}
          className="absolute inset-0 h-full w-full cursor-crosshair"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </div>
  );
}
