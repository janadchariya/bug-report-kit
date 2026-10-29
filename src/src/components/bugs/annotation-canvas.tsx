"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { drawShapes, imagePoint, resolveAnnotationColors, type AnnotationColors, type AnnotationShape, type AnnotationTool, type ShapeColor } from "@/src/lib/bugs/annotation";
import "./bug-images.css";

export interface AnnotationCanvasProps {
  screenshot: HTMLCanvasElement;
  tool: AnnotationTool | null;
  color: ShapeColor;
  shapes: readonly AnnotationShape[];
  zoom: number;
  onCommitShape: (shape: AnnotationShape) => void;
  disabled?: boolean;
}

export function AnnotationCanvas({ screenshot, tool, color, shapes, zoom, onCommitShape, disabled = false }: AnnotationCanvasProps) {
  const background = useRef<HTMLCanvasElement>(null);
  const foreground = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const colors = useRef<AnnotationColors | null>(null);
  const gesture = useRef<{ pointerId: number; shape: AnnotationShape } | null>(null);

  useEffect(() => {
    const layer = background.current;
    const ctx = layer?.getContext("2d");
    if (!layer || !ctx) return;
    ctx.clearRect(0, 0, layer.width, layer.height);
    ctx.drawImage(screenshot, 0, 0);
  }, [screenshot]);

  useEffect(() => {
    const layer = foreground.current;
    return () => {
      const current = gesture.current;
      gesture.current = null;
      if (current) layer?.releasePointerCapture?.(current.pointerId);
    };
  }, [screenshot, tool, disabled]);

  useEffect(() => {
    const layer = foreground.current;
    const ctx = layer?.getContext("2d");
    if (!layer || !ctx) return;
    ctx.clearRect(0, 0, layer.width, layer.height);
    colors.current = resolveAnnotationColors(layer);
    drawShapes(ctx, shapes, colors.current);
  }, [screenshot, shapes, tool, disabled]);

  function paint() {
    const layer = foreground.current;
    const ctx = layer?.getContext("2d");
    if (!layer || !ctx) return;
    ctx.clearRect(0, 0, layer.width, layer.height);
    if (colors.current) drawShapes(ctx, gesture.current ? [...shapes, gesture.current.shape] : shapes, colors.current);
  }
  function point(event: PointerEvent<HTMLCanvasElement>) {
    return imagePoint({ x: event.clientX, y: event.clientY }, event.currentTarget.getBoundingClientRect(), screenshot);
  }
  function updateShape(shape: AnnotationShape, next: { x: number; y: number }) {
    if (shape.kind === "path") {
      const last = shape.points[shape.points.length - 1];
      if (last.x !== next.x || last.y !== next.y) shape.points.push(next);
    } else shape.b = next;
  }
  function finish(event: PointerEvent<HTMLCanvasElement>, cancelled: boolean) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!cancelled && !disabled) {
      const shape = current.shape;
      updateShape(shape, point(event));
      if (shape.kind === "path" ? shape.points.length > 1 : Math.abs(shape.a.x - shape.b.x) >= 3 || Math.abs(shape.a.y - shape.b.y) >= 3) onCommitShape(shape);
    }
    paint();
  }

  return <div ref={viewport} className="bug-annotation__viewport" role="region" aria-label="Annotation image" tabIndex={disabled ? -1 : 0} style={{ touchAction: "pan-x pan-y" }}>
    {/* The shared aspect-ratio wrapper keeps the two layers aligned in Safari at every zoom. */}
    <div className="bug-annotation__raster" data-drawing={tool !== null && !disabled} style={{ width: `${Math.round(zoom * 100)}%`, aspectRatio: `${screenshot.width}/${screenshot.height}` }}>
      <canvas ref={background} width={screenshot.width} height={screenshot.height} aria-hidden="true" />
      <canvas ref={foreground} width={screenshot.width} height={screenshot.height} aria-label="Draw annotations" style={{ touchAction: tool && !disabled ? "none" : "pan-x pan-y" }}
        onPointerDown={(event) => {
          if (disabled || !tool || gesture.current || event.button !== 0) return;
          event.preventDefault(); viewport.current?.focus({ preventScroll: true }); event.currentTarget.setPointerCapture?.(event.pointerId);
          const start = point(event);
          colors.current = resolveAnnotationColors(event.currentTarget);
          gesture.current = { pointerId: event.pointerId, shape: tool === "path" ? { kind: "path", color, points: [start] } : { kind: tool, color, a: start, b: start } };
          paint();
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || current.pointerId !== event.pointerId || disabled) return;
          updateShape(current.shape, point(event));
          paint();
        }}
        onPointerUp={(event) => finish(event, false)} onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => { if (gesture.current?.pointerId === event.pointerId) { gesture.current = null; paint(); } }}
      />
    </div>
  </div>;
}
