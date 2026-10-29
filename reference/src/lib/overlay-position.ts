export interface OverlayRect { left: number; top: number; right: number; bottom: number }
export type OverlayPlacement = "top" | "bottom" | "left" | "right";

/** Bounds already include the desired inset. Constrain size before choosing a side. */
export function placeOverlay(anchor: OverlayRect, size: { width: number; height: number }, bounds: OverlayRect, preferred: OverlayPlacement = "top", gap = 6) {
  const width = Math.min(size.width, Math.max(0, bounds.right - bounds.left));
  const height = Math.min(size.height, Math.max(0, bounds.bottom - bounds.top));
  const centeredLeft = (anchor.left + anchor.right - width) / 2;
  const centeredTop = (anchor.top + anchor.bottom - height) / 2;
  const candidates = {
    top: { left: centeredLeft, top: anchor.top - height - gap },
    bottom: { left: centeredLeft, top: anchor.bottom + gap },
    left: { left: anchor.left - width - gap, top: centeredTop },
    right: { left: anchor.right + gap, top: centeredTop },
  };
  const order: OverlayPlacement[] = preferred === "right" ? ["right", "left", "bottom", "top"]
    : preferred === "left" ? ["left", "right", "bottom", "top"]
    : preferred === "bottom" ? ["bottom", "top", "right", "left"]
    : ["top", "bottom", "left", "right"];
  // Perpendicular clamping is allowed; only the main axis determines whether a side fits.
  const placement = order.find((side) => {
    const p = candidates[side];
    return side === "top" || side === "bottom"
      ? p.top >= bounds.top && p.top + height <= bounds.bottom
      : p.left >= bounds.left && p.left + width <= bounds.right;
  }) ?? preferred;
  const candidate = candidates[placement];
  return {
    left: Math.max(bounds.left, Math.min(candidate.left, bounds.right - width)),
    top: Math.max(bounds.top, Math.min(candidate.top, bounds.bottom - height)),
    width, height, placement,
  };
}
