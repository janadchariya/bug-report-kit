"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

function visible(element: HTMLElement) {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (current.hidden || current.inert || current.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  }
  return true;
}

/** Shared geometry contract: observe obstruction and declared action boxes, never their content. */
export function FloatingActionLayer({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const measureRef = useRef<(() => void) | null>(null);
  const [geometry, setGeometry] = useState({ blocked: false, lift: 0, keyboard: 0 });
  // React can remove a modal before its MutationObserver update is committed.
  // Restore the action's visibility and focusability in that same commit, before paint.
  useLayoutEffect(() => { measureRef.current?.(); });
  useEffect(() => {
    let disposed = false;
    const root = document.documentElement;
    const previousClearance = root.style.getPropertyValue("--shell-action-clearance");
    const previousBaseClearance = root.style.getPropertyValue("--shell-action-base-clearance");
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const observed = new Set<HTMLElement>();
    function measure() {
      if (disposed || !ref.current) return;
      const blocked = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).some(visible);
      const viewport = window.visualViewport;
      const keyboard = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      const box = ref.current.getBoundingClientRect();
      // Absolute introductions extend above and beside the FAB without enlarging
      // its parent. Include their visible boxes so page controls scroll clear of
      // them and a bar cannot overlap the introduction's wider left edge.
      const footprints = Array.from(ref.current.querySelectorAll<HTMLElement>("[data-shell-action-footprint]"));
      const boxes = [box, ...footprints.filter(visible).map((element) => element.getBoundingClientRect())
        .filter((footprint) => footprint.width > 0 && footprint.height > 0)];
      const left = Math.min(...boxes.map((footprint) => footprint.left));
      const right = Math.max(...boxes.map((footprint) => footprint.right));
      const height = box.bottom - Math.min(...boxes.map((footprint) => footprint.top));
      const phone = window.innerWidth <= 767;
      const tabbar = document.querySelector<HTMLElement>(".app-tabbar");
      const base = phone ? (tabbar?.getBoundingClientRect().height || 56) + 12 : 24;
      const bottom = window.innerHeight - keyboard - base;
      let ceiling = bottom;
      const markers = document.querySelectorAll<HTMLElement>("[data-shell-bottom-obstruction]");
      const targets = new Set([ref.current, ...footprints, ...(tabbar ? [tabbar] : []), ...markers]);
      for (const target of observed) if (!targets.has(target)) { resize?.unobserve(target); observed.delete(target); }
      for (const target of targets) if (!observed.has(target)) { resize?.observe(target); observed.add(target); }
      const obstacles = Array.from(markers).filter(visible).map((marker) => marker.getBoundingClientRect())
        .filter((obstacle) => obstacle.width > 0 && obstacle.height > 0 && obstacle.right > left && obstacle.left < right);
      // Moving above one fixed bar may put the action into a higher toast.
      // Each pass moves upwards, so the finite set always converges.
      for (let pass = 0; pass < obstacles.length; pass++) {
        const collisions = obstacles.filter((obstacle) => obstacle.bottom > ceiling - height && obstacle.top < ceiling);
        if (!collisions.length) break;
        ceiling = Math.min(...collisions.map((obstacle) => obstacle.top - 12));
      }
      const lift = ceiling < bottom ? window.innerHeight - ceiling : 0;
      // Keep scrollIntoView and the final page controls above the floating action,
      // including when an obstruction or the keyboard moves it farther upwards.
      const clearance = blocked ? 0 : window.innerHeight - ceiling + height + 12;
      root.style.setProperty("--shell-action-clearance", `${clearance}px`);
      // Nested scrollports reserve the footprint without feeding their own bar's
      // position back into their height when that bar raises the action.
      const baseClearance = blocked ? 0 : window.innerHeight - bottom + height + 12;
      root.style.setProperty("--shell-action-base-clearance", `${baseClearance}px`);
      setGeometry((previous) => previous.blocked === blocked && previous.lift === lift && previous.keyboard === keyboard ? previous : { blocked, lift, keyboard });
    }
    measureRef.current = measure;
    const mutation = new MutationObserver(measure);
    mutation.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "inert", "aria-hidden", "open", "aria-modal", "role", "data-shell-bottom-obstruction", "data-shell-action-footprint"] });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    measure();
    return () => {
      measureRef.current = null;
      disposed = true; mutation.disconnect(); resize?.disconnect();
      if (previousClearance) root.style.setProperty("--shell-action-clearance", previousClearance);
      else root.style.removeProperty("--shell-action-clearance");
      if (previousBaseClearance) root.style.setProperty("--shell-action-base-clearance", previousBaseClearance);
      else root.style.removeProperty("--shell-action-base-clearance");
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
    };
  }, []);
  return <div ref={ref} className="shell-floating-action" hidden={geometry.blocked} inert={geometry.blocked} style={{ "--shell-action-lift": `${geometry.lift}px`, "--shell-keyboard-inset": `${geometry.keyboard}px` } as CSSProperties}>{children}</div>;
}
