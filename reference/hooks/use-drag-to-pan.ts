"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drag-to-pan for a scrollable container (zoomed image / document viewers).
 *
 * Attach the returned `ref` to an `overflow-auto` element and spread
 * `panProps` onto it; the user can then left-click-drag anywhere inside to
 * scroll both axes. While dragging, listeners live on `window` so the pan
 * keeps tracking even if the cursor leaves the element. `grabbing` is true
 * during a drag (drive the grab/grabbing cursor with it).
 *
 * Put `draggable={false}` on any `<img>` inside so the browser's native
 * image-drag ghost doesn't hijack the gesture. Spread `panProps`
 * conditionally (e.g. only when zoomed in) if panning should be gated.
 */
export function useDragToPan<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const start = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const [grabbing, setGrabbing] = useState(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // left button only
    const el = ref.current;
    if (!el) return;
    start.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    setGrabbing(true);
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!grabbing) return;
    function handleMove(e: MouseEvent) {
      const el = ref.current;
      if (!el) return;
      el.scrollLeft = start.current.scrollLeft - (e.clientX - start.current.x);
      el.scrollTop = start.current.scrollTop - (e.clientY - start.current.y);
    }
    function handleUp() {
      setGrabbing(false);
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [grabbing]);

  return { ref, grabbing, panProps: { onMouseDown } };
}
