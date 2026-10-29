"use client";

import { useEffect, useRef } from "react";
import { containingDialog } from "./overlay-bounds";

const suppressed = new WeakSet<HTMLElement>();

/** Modal autofocus and focus restoration must never announce a tooltip. */
export function focusWithoutTooltip(target: HTMLElement | null | undefined) {
  if (!target) return;
  suppressed.add(target);
  target.focus();
  suppressed.delete(target);
}

/** Dialog focus needs a navigation keystroke; ordinary initial focus keeps its description. */
export function useTooltipKeyboardFocus() {
  const navigating = useRef(false);
  const untouched = useRef(true);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function keydown(event: KeyboardEvent) {
      untouched.current = false;
      clearTimeout(timer);
      navigating.current = ["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key);
      timer = setTimeout(() => { navigating.current = false; }, 0);
    }
    function pointerdown() { untouched.current = false; navigating.current = false; }
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("pointerdown", pointerdown, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("pointerdown", pointerdown, true);
    };
  }, []);
  return (target: HTMLElement) => (navigating.current || (untouched.current && !containingDialog(target)))
    && !suppressed.has(target) && target.matches(":focus-visible");
}

let lastClosed = -Infinity;
export function tooltipHoverDelay() {
  const elapsed = Date.now() - lastClosed;
  return elapsed >= 0 && elapsed < 800 ? 0 : 400;
}
export function markTooltipClosed() { lastClosed = Date.now(); }
