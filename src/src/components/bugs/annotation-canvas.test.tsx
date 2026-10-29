import { fireEvent, render, screen } from "@testing-library/react";
import { AnnotationCanvas } from "./annotation-canvas";

beforeEach(() => {
  vi.stubGlobal("PointerEvent", class extends MouseEvent { pointerId: number; constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; } });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), ellipse: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn() } as unknown as CanvasRenderingContext2D);
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("resolves annotation colours once at pointerdown rather than on every pointermove", () => {
  const screenshot = document.createElement("canvas"); screenshot.width = screenshot.height = 100;
  render(<AnnotationCanvas screenshot={screenshot} tool="rect" color="red" shapes={[]} zoom={1} onCommitShape={vi.fn()} />);
  const layer = screen.getByLabelText("Draw annotations");
  vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
  const resolve = vi.spyOn(window, "getComputedStyle");
  fireEvent.pointerDown(layer, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
  expect(resolve).toHaveBeenCalledTimes(1);
  fireEvent.pointerMove(layer, { pointerId: 1, clientX: 20, clientY: 30 });
  fireEvent.pointerMove(layer, { pointerId: 1, clientX: 30, clientY: 40 });
  expect(resolve).toHaveBeenCalledTimes(1);
});

it("keeps both native canvases at the bounded raster size and maps a zoomed pointer drag", () => {
  const screenshot = document.createElement("canvas"); screenshot.width = 1920; screenshot.height = 960;
  const commit = vi.fn();
  const { container } = render(<AnnotationCanvas screenshot={screenshot} tool="rect" color="red" shapes={[]} zoom={1.5} onCommitShape={commit} />);
  const canvases = container.querySelectorAll("canvas");
  expect(Array.from(canvases).map((canvas) => [canvas.width, canvas.height])).toEqual([[1920, 960], [1920, 960]]);
  const layer = screen.getByLabelText("Draw annotations");
  vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({ left: 10, top: 20, width: 960, height: 480 } as DOMRect);
  fireEvent.pointerDown(layer, { pointerId: 7, button: 0, clientX: 110, clientY: 70 });
  fireEvent.pointerMove(layer, { pointerId: 7, clientX: 410, clientY: 220 });
  fireEvent.pointerUp(layer, { pointerId: 7, clientX: 410, clientY: 220 });
  expect(commit).toHaveBeenCalledWith({ kind: "rect", color: "red", a: { x: 200, y: 100 }, b: { x: 800, y: 400 } });
  expect(layer.setPointerCapture).toHaveBeenCalledWith(7);
  expect(layer.releasePointerCapture).toHaveBeenCalledWith(7);
});

it("cancels touch/pointer gestures and ignores a different pointer", () => {
  const screenshot = document.createElement("canvas"); screenshot.width = screenshot.height = 100;
  const commit = vi.fn();
  render(<AnnotationCanvas screenshot={screenshot} tool="rect" color="red" shapes={[]} zoom={1} onCommitShape={commit} />);
  const layer = screen.getByLabelText("Draw annotations");
  vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
  fireEvent.pointerDown(layer, { pointerId: 1, clientX: 10, clientY: 10, button: 0 });
  fireEvent.pointerMove(layer, { pointerId: 2, clientX: 80, clientY: 80 });
  fireEvent.pointerCancel(layer, { pointerId: 1 });
  fireEvent.pointerUp(layer, { pointerId: 1, clientX: 90, clientY: 90 });
  expect(commit).not.toHaveBeenCalled();
});

it("keeps the scrollable viewport focusable without a pointer-only canvas tab stop", () => {
  const screenshot = document.createElement("canvas"); screenshot.width = screenshot.height = 100;
  const view = render(<AnnotationCanvas screenshot={screenshot} tool="rect" color="red" shapes={[]} zoom={1} onCommitShape={vi.fn()} />);
  const viewport = screen.getByRole("region", { name: "Annotation image" });
  const layer = screen.getByLabelText("Draw annotations");
  expect(viewport).toHaveAttribute("tabindex", "0");
  expect(layer).not.toHaveAttribute("tabindex");
  fireEvent.pointerDown(layer, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
  expect(viewport).toHaveFocus();
  view.rerender(<AnnotationCanvas screenshot={screenshot} tool="rect" color="red" shapes={[]} zoom={1} onCommitShape={vi.fn()} disabled />);
  expect(viewport).toHaveAttribute("tabindex", "-1");
  expect(layer).not.toHaveAttribute("tabindex");
});

it("keeps native scrolling on the viewport while reserving a selected tool's canvas for touch drawing", () => {
  const screenshot = document.createElement("canvas"); screenshot.width = 400; screenshot.height = 200;
  const commit = vi.fn();
  render(<AnnotationCanvas screenshot={screenshot} tool="ellipse" color="yellow" shapes={[]} zoom={2} onCommitShape={commit} />);
  const viewport = screen.getByRole("region", { name: "Annotation image" });
  expect(viewport).toHaveStyle({ touchAction: "pan-x pan-y" });
  const layer = screen.getByLabelText("Draw annotations");
  expect(layer).toHaveStyle({ touchAction: "none" });
  vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({ left: -40, top: -20, width: 800, height: 400 } as DOMRect);
  fireEvent.pointerDown(layer, { pointerId: 8, button: 0, clientX: 160, clientY: 80 });
  fireEvent.pointerMove(layer, { pointerId: 8, clientX: 360, clientY: 180 });
  fireEvent.pointerUp(layer, { pointerId: 8, clientX: 360, clientY: 180 });
  expect(commit).toHaveBeenCalledExactlyOnceWith({ kind: "ellipse", color: "yellow", a: { x: 100, y: 50 }, b: { x: 200, y: 100 } });
});

it("leaves touch drags to native scrolling without capturing or committing when no tool is selected", () => {
  const screenshot = document.createElement("canvas"); screenshot.width = screenshot.height = 100;
  const commit = vi.fn();
  render(<AnnotationCanvas screenshot={screenshot} tool={null} color="red" shapes={[]} zoom={2} onCommitShape={commit} />);
  const layer = screen.getByLabelText("Draw annotations");
  expect(layer).toHaveStyle({ touchAction: "pan-x pan-y" });
  const down = new PointerEvent("pointerdown", { pointerId: 4, button: 0, clientX: 10, clientY: 20, bubbles: true, cancelable: true });
  fireEvent(layer, down);
  fireEvent.pointerMove(layer, { pointerId: 4, clientX: 30, clientY: 50 });
  fireEvent.pointerUp(layer, { pointerId: 4, clientX: 30, clientY: 50 });
  expect(down.defaultPrevented).toBe(false);
  expect(layer.setPointerCapture).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});

it("discards a partial mark when its drawing tool is deselected", () => {
  const screenshot = document.createElement("canvas"); screenshot.width = screenshot.height = 100;
  const commit = vi.fn();
  const view = render(<AnnotationCanvas screenshot={screenshot} tool="rect" color="red" shapes={[]} zoom={1} onCommitShape={commit} />);
  const layer = screen.getByLabelText("Draw annotations");
  vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
  fireEvent.pointerDown(layer, { pointerId: 5, button: 0, clientX: 10, clientY: 20 });
  fireEvent.pointerMove(layer, { pointerId: 5, clientX: 30, clientY: 50 });
  view.rerender(<AnnotationCanvas screenshot={screenshot} tool={null} color="red" shapes={[]} zoom={1} onCommitShape={commit} />);
  fireEvent.pointerUp(layer, { pointerId: 5, clientX: 30, clientY: 50 });
  expect(layer.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(5);
  expect(commit).not.toHaveBeenCalled();
});

it("collects only the active pointer's freehand points and leaves committed shapes immutable", () => {
  const screenshot = document.createElement("canvas"); screenshot.width = screenshot.height = 100;
  const existing = { kind: "path" as const, color: "red" as const, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] };
  const commit = vi.fn();
  render(<AnnotationCanvas screenshot={screenshot} tool="path" color="green" shapes={[existing]} zoom={1} onCommitShape={commit} />);
  const layer = screen.getByLabelText("Draw annotations");
  vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
  fireEvent.pointerDown(layer, { pointerId: 9, button: 0, clientX: 10, clientY: 20 });
  fireEvent.pointerMove(layer, { pointerId: 10, clientX: 90, clientY: 90 });
  fireEvent.pointerMove(layer, { pointerId: 9, clientX: 30, clientY: 50 });
  fireEvent.pointerMove(layer, { pointerId: 9, clientX: 40, clientY: 30 });
  fireEvent.pointerUp(layer, { pointerId: 9, clientX: 40, clientY: 30 });
  expect(commit).toHaveBeenCalledExactlyOnceWith({ kind: "path", color: "green", points: [{ x: 10, y: 20 }, { x: 30, y: 50 }, { x: 40, y: 30 }] });
  expect(existing.points).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
});

it("discards accidental path clicks, cancelled paths, and disabled drawing", () => {
  const screenshot = document.createElement("canvas"); screenshot.width = screenshot.height = 100;
  const commit = vi.fn();
  const view = render(<AnnotationCanvas screenshot={screenshot} tool="path" color="red" shapes={[]} zoom={1} onCommitShape={commit} />);
  const layer = screen.getByLabelText("Draw annotations");
  vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
  fireEvent.pointerDown(layer, { pointerId: 1, button: 0, clientX: 10, clientY: 20 });
  fireEvent.pointerUp(layer, { pointerId: 1, clientX: 10, clientY: 20 });
  fireEvent.pointerDown(layer, { pointerId: 2, button: 0, clientX: 10, clientY: 20 });
  fireEvent.pointerMove(layer, { pointerId: 2, clientX: 30, clientY: 50 });
  fireEvent.pointerCancel(layer, { pointerId: 2 });
  view.rerender(<AnnotationCanvas screenshot={screenshot} tool="path" color="red" shapes={[]} zoom={1} onCommitShape={commit} disabled />);
  fireEvent.pointerDown(layer, { pointerId: 3, button: 0, clientX: 10, clientY: 20 });
  fireEvent.pointerMove(layer, { pointerId: 3, clientX: 30, clientY: 50 });
  fireEvent.pointerUp(layer, { pointerId: 3, clientX: 30, clientY: 50 });
  expect(commit).not.toHaveBeenCalled();
});

it("clears the background before painting a same-size replacement with transparent pixels", () => {
  const screenshot = document.createElement("canvas"); screenshot.width = screenshot.height = 100;
  const replacement = document.createElement("canvas"); replacement.width = replacement.height = 100;
  const commit = vi.fn();
  const view = render(<AnnotationCanvas screenshot={screenshot} tool="rect" color="red" shapes={[]} zoom={1} onCommitShape={commit} />);
  const background = view.container.querySelector("canvas")!;
  const operations: string[] = [];
  const ctx = {
    clearRect: vi.fn(() => operations.push("clear")),
    drawImage: vi.fn(() => operations.push("draw")),
  };
  Object.defineProperty(background, "getContext", { value: () => ctx, configurable: true });

  view.rerender(<AnnotationCanvas screenshot={replacement} tool="rect" color="red" shapes={[]} zoom={1} onCommitShape={commit} />);

  expect(operations).toEqual(["clear", "draw"]);
  expect(ctx.clearRect).toHaveBeenCalledExactlyOnceWith(0, 0, 100, 100);
  expect(ctx.drawImage).toHaveBeenCalledExactlyOnceWith(replacement, 0, 0);
});

it("discards an in-flight gesture when its screenshot changes and accepts a fresh gesture", () => {
  const screenshot = document.createElement("canvas"); screenshot.width = screenshot.height = 100;
  const replacement = document.createElement("canvas"); replacement.width = replacement.height = 100;
  const commit = vi.fn();
  const view = render(<AnnotationCanvas screenshot={screenshot} tool="rect" color="red" shapes={[]} zoom={1} onCommitShape={commit} />);
  const layer = screen.getByLabelText("Draw annotations");
  vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
  fireEvent.pointerDown(layer, { pointerId: 1, button: 0, clientX: 10, clientY: 20 });
  fireEvent.pointerMove(layer, { pointerId: 1, clientX: 30, clientY: 50 });

  view.rerender(<AnnotationCanvas screenshot={replacement} tool="rect" color="red" shapes={[]} zoom={1} onCommitShape={commit} />);
  expect(layer.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
  fireEvent.pointerUp(layer, { pointerId: 1, clientX: 30, clientY: 50 });
  expect(commit).not.toHaveBeenCalled();

  fireEvent.pointerDown(layer, { pointerId: 2, button: 0, clientX: 40, clientY: 10 });
  fireEvent.pointerUp(layer, { pointerId: 2, clientX: 80, clientY: 70 });
  expect(commit).toHaveBeenCalledExactlyOnceWith({ kind: "rect", color: "red", a: { x: 40, y: 10 }, b: { x: 80, y: 70 } });
});
