"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Button } from "@/src/components/ui/button";
import type { BugImageMeta } from "@/src/lib/bugs/types";
import "./bug-images.css";

export function BugImageViewer({ image }: { image: BugImageMeta }) {
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  if (image.removed) return <p className="bug-image__removed">{image.kind === "screenshot" ? "Screenshot removed" : "Image removed"}</p>;
  const expected = `/api/bugs/images/${image.id}`;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(image.id) || image.url !== expected) return <p className="bug-image__hint">ไม่สามารถแสดงรูปนี้ได้</p>;

  function end(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.id !== event.pointerId) return;
    gesture.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId);
  }
  return <div className="bug-image-viewer">
    <div className="bug-image__actions bug-image-viewer__actions"><Button size="sm" aria-label="Zoom out" disabled={zoom <= 0.25} onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}>−</Button><span>{Math.round(zoom * 100)}%</span><Button size="sm" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + 0.25))}>+</Button><Button size="sm" aria-label="Reset zoom" onClick={() => { setZoom(1); if (viewport.current) { viewport.current.scrollLeft = 0; viewport.current.scrollTop = 0; } }}>Reset</Button><span className="bug-image__hint">ลากในภาพเพื่อเลื่อนดู</span><a className="bug-image-viewer__download" href={expected} download>Download</a></div>
    <div ref={viewport} className="bug-image-viewer__viewport" role="region" aria-label="Image viewer" tabIndex={0}
      onPointerDown={(event) => { if (event.pointerType !== "mouse" || event.button !== 0 || gesture.current) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture?.(event.pointerId); gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }; }}
      onPointerMove={(event) => { const start = gesture.current; if (!start || start.id !== event.pointerId) return; event.currentTarget.scrollLeft = start.left - (event.clientX - start.x); event.currentTarget.scrollTop = start.top - (event.clientY - start.y); }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={(event) => { if (gesture.current?.id === event.pointerId) gesture.current = null; }}>
      {/* The authenticated URL must be loaded directly; Next's image optimizer must never proxy/cache it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url} alt={image.kind === "screenshot" ? "Bug screenshot" : "Comment attachment"} width={image.width} height={image.height} draggable={false} style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }} />
    </div>
  </div>;
}
