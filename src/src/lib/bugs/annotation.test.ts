import { drawShape, imagePoint, resolveAnnotationColors, type AnnotationColors } from "./annotation";

const colors: AnnotationColors = { red: "rgb(1, 2, 3)", yellow: "rgb(4, 5, 6)", green: "rgb(7, 8, 9)" };

it("maps a CSS resized and zoomed canvas into bounded image coordinates", () => {
  const bounds = { left: 30, top: 50, width: 480, height: 960 };
  expect(imagePoint({ x: 270, y: 530 }, bounds, { width: 960, height: 1920 })).toEqual({ x: 480, y: 960 });
  expect(imagePoint({ x: -10, y: 2000 }, bounds, { width: 960, height: 1920 })).toEqual({ x: 0, y: 1920 });
});

it("normalizes reverse rectangle drags and uses the resolved token color", () => {
  const ctx = { save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn() };
  drawShape(ctx as unknown as CanvasRenderingContext2D, { kind: "rect", color: "red", a: { x: 100, y: 80 }, b: { x: 20, y: 10 } }, colors);
  expect(ctx.strokeRect).toHaveBeenCalledWith(20, 10, 80, 70);
  expect(ctx).toHaveProperty("strokeStyle", colors.red);
  expect(ctx).toHaveProperty("lineWidth", 3);
  expect(ctx.restore).toHaveBeenCalled();
});

it("draws reverse ellipse drags using their centre and non-negative radii", () => {
  const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), ellipse: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn() };
  drawShape(ctx as unknown as CanvasRenderingContext2D, { kind: "ellipse", color: "yellow", a: { x: 100, y: 80 }, b: { x: 20, y: 10 } }, colors);
  expect(ctx.ellipse).toHaveBeenCalledWith(60, 45, 40, 35, 0, 0, Math.PI * 2);
  expect(ctx.stroke).toHaveBeenCalledOnce();
  expect(ctx).toHaveProperty("strokeStyle", colors.yellow);
  expect(ctx).toHaveProperty("lineWidth", 3);
});

it("draws a freehand path through every point without closing or filling it", () => {
  const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), closePath: vi.fn(), fill: vi.fn() };
  drawShape(ctx as unknown as CanvasRenderingContext2D, { kind: "path", color: "green", points: [{ x: 10, y: 20 }, { x: 20, y: 50 }, { x: 40, y: 30 }] }, colors);
  expect(ctx.moveTo).toHaveBeenCalledExactlyOnceWith(10, 20);
  expect(ctx.lineTo.mock.calls).toEqual([[20, 50], [40, 30]]);
  expect(ctx.stroke).toHaveBeenCalledOnce();
  expect(ctx.closePath).not.toHaveBeenCalled();
  expect(ctx.fill).not.toHaveBeenCalled();
  expect(ctx).toHaveProperty("lineWidth", 3);
});

it("ignores an accidental one-point freehand path", () => {
  const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() };
  drawShape(ctx as unknown as CanvasRenderingContext2D, { kind: "path", color: "red", points: [{ x: 10, y: 20 }] }, colors);
  expect(ctx.stroke).not.toHaveBeenCalled();
  expect(ctx.restore).toHaveBeenCalledOnce();
});

it("draws an arrow shaft and filled arrowhead in the same coordinate space", () => {
  const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), closePath: vi.fn(), fill: vi.fn() };
  drawShape(ctx as unknown as CanvasRenderingContext2D, { kind: "arrow", color: "green", a: { x: 10, y: 20 }, b: { x: 110, y: 20 } }, colors);
  expect(ctx.moveTo).toHaveBeenCalledWith(10, 20);
  expect(ctx.lineTo).toHaveBeenCalledWith(110, 20);
  expect(ctx.stroke).toHaveBeenCalledOnce();
  expect(ctx.fill).toHaveBeenCalledOnce();
  expect(ctx).toHaveProperty("fillStyle", colors.green);
});

it("resolves drawing colors from Sales computed tokens", () => {
  const node = document.createElement("div");
  node.style.setProperty("--negative", "#dc2626");
  node.style.setProperty("--caution-dot", "#f59e0b");
  node.style.setProperty("--positive", "#15803d");
  document.body.append(node);
  expect(resolveAnnotationColors(node)).toEqual({ red: "#dc2626", yellow: "#f59e0b", green: "#15803d" });
  node.remove();
});
