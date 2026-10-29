export type Point = { x: number; y: number };
export type ShapeColor = "red" | "yellow" | "green";
export type AnnotationTool = "rect" | "ellipse" | "arrow" | "path";
export type AnnotationShape =
  | { kind: "rect" | "ellipse" | "arrow"; color: ShapeColor; a: Point; b: Point }
  | { kind: "path"; color: ShapeColor; points: Point[] };
export type AnnotationColors = Record<ShapeColor, string>;

export function imagePoint(point: Point, bounds: { left: number; top: number; width: number; height: number }, size: { width: number; height: number }): Point {
  return {
    x: Math.max(0, Math.min(size.width, (point.x - bounds.left) * size.width / (bounds.width || 1))),
    y: Math.max(0, Math.min(size.height, (point.y - bounds.top) * size.height / (bounds.height || 1))),
  };
}

/** Canvas needs computed values, rather than CSS var() expressions. */
export function resolveAnnotationColors(element: Element): AnnotationColors {
  const style = getComputedStyle(element);
  return {
    red: style.getPropertyValue("--negative").trim(),
    yellow: style.getPropertyValue("--caution-dot").trim(),
    green: style.getPropertyValue("--positive").trim(),
  };
}

export function drawShape(ctx: CanvasRenderingContext2D, shape: AnnotationShape, colors: AnnotationColors): void {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = colors[shape.color];
  ctx.fillStyle = colors[shape.color];
  if (shape.kind === "rect") {
    ctx.strokeRect(Math.min(shape.a.x, shape.b.x), Math.min(shape.a.y, shape.b.y), Math.abs(shape.b.x - shape.a.x), Math.abs(shape.b.y - shape.a.y));
  } else if (shape.kind === "ellipse") {
    ctx.beginPath();
    ctx.ellipse((shape.a.x + shape.b.x) / 2, (shape.a.y + shape.b.y) / 2, Math.abs(shape.b.x - shape.a.x) / 2, Math.abs(shape.b.y - shape.a.y) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape.kind === "path") {
    if (shape.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (const point of shape.points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  } else {
    const angle = Math.atan2(shape.b.y - shape.a.y, shape.b.x - shape.a.x);
    const headLength = 14;
    ctx.beginPath();
    ctx.moveTo(shape.a.x, shape.a.y);
    ctx.lineTo(shape.b.x, shape.b.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(shape.b.x, shape.b.y);
    ctx.lineTo(shape.b.x - headLength * Math.cos(angle - Math.PI / 6), shape.b.y - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(shape.b.x - headLength * Math.cos(angle + Math.PI / 6), shape.b.y - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawShapes(ctx: CanvasRenderingContext2D, shapes: readonly AnnotationShape[], colors: AnnotationColors): void {
  for (const shape of shapes) drawShape(ctx, shape, colors);
}
