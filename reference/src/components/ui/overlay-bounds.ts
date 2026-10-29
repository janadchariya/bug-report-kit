import type { OverlayRect } from "@/src/lib/overlay-position";

export function containingDialog(anchor: HTMLElement): HTMLElement | null {
  const panel = anchor.closest<HTMLElement>('[role="dialog"]');
  if (panel) return panel;
  const ownerId = anchor.closest<HTMLElement>("[data-overlay-container]")?.dataset.overlayContainer;
  return ownerId ? document.getElementById(ownerId) : null;
}

export function overlayBounds(anchor: HTMLElement): OverlayRect {
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const panel = containingDialog(anchor)?.getBoundingClientRect();
  return {
    left: Math.max(0, panel?.left ?? 0) + 8,
    top: Math.max(0, panel?.top ?? 0) + 8,
    right: Math.min(viewportWidth, panel?.right ?? viewportWidth) - 8,
    bottom: Math.min(viewportHeight, panel?.bottom ?? viewportHeight) - 8,
  };
}

/** A background portal must not float above a subsequently opened modal. */
export function overlayIsActive(anchor: HTMLElement): boolean {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
    .filter((panel) => !panel.hidden && window.getComputedStyle(panel).display !== "none");
  const active = dialogs.at(-1);
  return !active || containingDialog(anchor) === active;
}
