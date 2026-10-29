"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, cloneElement, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { placeOverlay } from "@/src/lib/overlay-position";
import { overlayBounds, overlayIsActive } from "./overlay-bounds";
import { markTooltipClosed, tooltipHoverDelay, useTooltipKeyboardFocus } from "./tooltip-focus";

export function Tooltip({ children, label }: { children: ReactElement; label: string; dismissOnClick?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [hoverPending, setHoverPending] = useState(false);
  const tooltipId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focused = useRef(false);
  const isKeyboardFocus = useTooltipKeyboardFocus();
  const [position, setPosition] = useState({ left: 0, top: 0, clipped: false });

  function hide() {
    focused.current = false;
    clearTimeout(hoverTimer.current);
    setHoverPending(false);
    if (visible) markTooltipClosed();
    setVisible(false);
  }

  useEffect(() => {
    const dismiss = () => { clearTimeout(hoverTimer.current); setHoverPending(false); setVisible(false); };
    const scroll = () => {
      clearTimeout(hoverTimer.current);
      setHoverPending(false);
      if (!focused.current) setVisible(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      clearTimeout(hoverTimer.current);
      setHoverPending(false);
    };
    window.addEventListener("scroll", scroll, true);
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", keydown, true);
    return () => {
      clearTimeout(hoverTimer.current);
      window.removeEventListener("scroll", scroll, true);
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", keydown, true);
    };
  }, []);

  useEffect(() => {
    if (!visible && !hoverPending) return;
    function dismissIfBlocked() {
      if (!anchorRef.current || overlayIsActive(anchorRef.current)) return;
      clearTimeout(hoverTimer.current);
      setHoverPending(false);
      setVisible(false);
    }
    const observer = new MutationObserver(dismissIfBlocked);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "hidden"] });
    dismissIfBlocked();
    return () => observer.disconnect();
  }, [visible, hoverPending]);

  useLayoutEffect(() => {
    if (!visible) return;
    function updatePosition() {
      if (!anchorRef.current || !tooltipRef.current) return;
      if (!overlayIsActive(anchorRef.current)) { setVisible(false); return; }
      const trigger = anchorRef.current.getBoundingClientRect();
      const bounds = overlayBounds(anchorRef.current);
      const tooltipElement = tooltipRef.current;
      tooltipElement.style.maxWidth = `${Math.min(320, Math.max(0, bounds.right - bounds.left))}px`;
      tooltipElement.style.maxHeight = `${Math.max(0, bounds.bottom - bounds.top)}px`;
      const tooltip = tooltipElement.getBoundingClientRect();
      let clipped = trigger.bottom <= bounds.top || trigger.top >= bounds.bottom || trigger.right <= bounds.left || trigger.left >= bounds.right;
      const clippingOverflow = /^(auto|scroll|hidden|clip)$/;
      for (let ancestor = anchorRef.current.parentElement; ancestor && !clipped; ancestor = ancestor.parentElement) {
        const style = window.getComputedStyle(ancestor);
        const clipsX = clippingOverflow.test(style.overflow) || clippingOverflow.test(style.overflowX);
        const clipsY = clippingOverflow.test(style.overflow) || clippingOverflow.test(style.overflowY);
        if (!clipsX && !clipsY) continue;
        const rect = ancestor.getBoundingClientRect();
        clipped = (clipsX && (trigger.right <= rect.left || trigger.left >= rect.right))
          || (clipsY && (trigger.bottom <= rect.top || trigger.top >= rect.bottom));
      }
      const result = placeOverlay(trigger, tooltip, bounds);
      setPosition({ left: result.left, top: result.top, clipped });
    }
    function dismiss() { clearTimeout(hoverTimer.current); markTooltipClosed(); setVisible(false); }
    function scroll() { if (focused.current) updatePosition(); else dismiss(); }
    function keydown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dismiss();
    }
    updatePosition();
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("keydown", keydown, true);
    return () => {
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("keydown", keydown, true);
    };
  }, [visible]);

  return (
    <span
      ref={anchorRef}
      className="ui-tooltip-anchor"
      onBlur={hide}
      onClickCapture={hide}
      onPointerDown={hide}
      onFocus={(event) => {
        if (isKeyboardFocus(event.target as HTMLElement)) { focused.current = true; setVisible(true); }
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        clearTimeout(hoverTimer.current);
        setHoverPending(true);
        hoverTimer.current = setTimeout(() => { setHoverPending(false); setVisible(true); }, tooltipHoverDelay());
      }}
      onPointerLeave={hide}
    >
      <span>{cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, {
        "aria-describedby": [children.props && (children.props as { "aria-describedby"?: string })["aria-describedby"], visible ? tooltipId : undefined].filter(Boolean).join(" ") || undefined,
      })}</span>
      {visible ? createPortal(
        <span ref={tooltipRef} className="ui-tooltip" id={tooltipId} role="tooltip" aria-label={label} style={{ left: position.left, top: position.top, visibility: position.clipped ? "hidden" : "visible" }}>
          {label}
        </span>,
        document.body,
      ) : null}
    </span>
  );
}
