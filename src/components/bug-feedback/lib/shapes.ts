/**
 * Annotation shapes & canvas drawing primitives. Pure functions only —
 * the canvas is passed in. Keeps drawing logic testable in isolation.
 */

export type ShapeColor = "red" | "yellow" | "green";

export const SHAPE_COLOR_HEX: Record<ShapeColor, string> = {
  red: "#dc2626",
  yellow: "#eab308",
  green: "#16a34a",
};

export type Point = { x: number; y: number };

export type RectShape = {
  kind: "rect";
  color: ShapeColor;
  a: Point;
  b: Point;
};

export type EllipseShape = {
  kind: "ellipse";
  color: ShapeColor;
  a: Point;
  b: Point;
};

export type ArrowShape = {
  kind: "arrow";
  color: ShapeColor;
  a: Point;
  b: Point;
};

export type PathShape = {
  kind: "path";
  color: ShapeColor;
  points: Point[];
};

export type Shape = RectShape | EllipseShape | ArrowShape | PathShape;

const STROKE = 3;

export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape) {
  ctx.save();
  ctx.lineWidth = STROKE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = SHAPE_COLOR_HEX[shape.color];
  ctx.fillStyle = SHAPE_COLOR_HEX[shape.color];

  switch (shape.kind) {
    case "rect": {
      const x = Math.min(shape.a.x, shape.b.x);
      const y = Math.min(shape.a.y, shape.b.y);
      const w = Math.abs(shape.b.x - shape.a.x);
      const h = Math.abs(shape.b.y - shape.a.y);
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case "ellipse": {
      const cx = (shape.a.x + shape.b.x) / 2;
      const cy = (shape.a.y + shape.b.y) / 2;
      const rx = Math.abs(shape.b.x - shape.a.x) / 2;
      const ry = Math.abs(shape.b.y - shape.a.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "arrow": {
      drawArrow(ctx, shape.a, shape.b);
      break;
    }
    case "path": {
      if (shape.points.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, a: Point, b: Point) {
  const headLen = 14;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(
    b.x - headLen * Math.cos(angle - Math.PI / 6),
    b.y - headLen * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    b.x - headLen * Math.cos(angle + Math.PI / 6),
    b.y - headLen * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}

export function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[]) {
  for (const s of shapes) drawShape(ctx, s);
}
