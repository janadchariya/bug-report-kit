import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnnotationShape } from "@/src/lib/bugs/annotation";
import { exportAnnotatedImage } from "@/src/lib/bugs/prepare-image";
import { AnnotationEditor } from "./annotation-editor";

vi.mock("@/src/lib/bugs/prepare-image", () => ({ exportAnnotatedImage: vi.fn() }));
const shape: AnnotationShape = { kind: "rect", color: "red", a: { x: 1, y: 1 }, b: { x: 20, y: 30 } };
beforeEach(() => {
  const matchMedia = window.matchMedia;
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ ...matchMedia(query), matches: query === "(pointer: coarse)" }));
  vi.stubGlobal("PointerEvent", class extends MouseEvent { pointerId: number; constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; } });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.mocked(exportAnnotatedImage).mockResolvedValue(new Blob(["ready"], { type: "image/webp" }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("offers four tools, named selected colors and shape-only undo/reset inside the parent's dialog", () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const change = vi.fn(); const source = document.createElement("canvas"); source.width = source.height = 100;
  render(<AnnotationEditor source={source} shapes={[shape]} onShapesChange={change} onApply={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Rectangle" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Arrow" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Yellow" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Green" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ellipse" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Freehand" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Undo" })); expect(change).toHaveBeenLastCalledWith([]);
  fireEvent.click(screen.getByRole("button", { name: "Start over" })); expect(change).toHaveBeenLastCalledWith([]);
});

it("scopes undo/zoom shortcuts to editor focus and ignores editable targets", () => {
  const change = vi.fn(); const source = document.createElement("canvas"); source.width = source.height = 100;
  render(<><textarea aria-label="Description" /><AnnotationEditor source={source} shapes={[shape]} onShapesChange={change} onApply={vi.fn()} onCancel={vi.fn()} /></>);
  fireEvent.keyDown(screen.getByLabelText("Description"), { key: "z", ctrlKey: true });
  fireEvent.keyDown(document, { key: "z", ctrlKey: true });
  expect(change).not.toHaveBeenCalled();
  const editor = screen.getByRole("region", { name: "Annotation editor" });
  const editable = document.createElement("textarea"); editor.append(editable);
  fireEvent.keyDown(editable, { key: "z", ctrlKey: true }); expect(change).not.toHaveBeenCalled();
  fireEvent.keyDown(editor, { key: "z", ctrlKey: true, shiftKey: true });
  fireEvent.keyDown(editor, { key: "z", metaKey: true, shiftKey: true });
  expect(change).not.toHaveBeenCalled();
  fireEvent.keyDown(editor, { key: "z", ctrlKey: true }); expect(change).toHaveBeenCalledWith([]);
  fireEvent.keyDown(editor, { key: "+" }); expect(screen.getByRole("button", { name: "Reset zoom (125%)" })).toHaveTextContent("125%");
});

it("starts fine-pointer editing with Rectangle selected and omits the touch hint", () => {
  vi.mocked(window.matchMedia).mockImplementation((query) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  const source = document.createElement("canvas"); source.width = source.height = 100;
  render(<AnnotationEditor source={source} shapes={[]} onShapesChange={vi.fn()} onApply={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Rectangle" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByText(/กดเครื่องมือที่เลือกซ้ำเพื่อเลื่อนภาพ/)).not.toBeInTheDocument();
});

it("shows a compact percentage with an accessible Reset zoom action", () => {
  const source = document.createElement("canvas"); source.width = source.height = 100;
  render(<AnnotationEditor source={source} shapes={[]} onShapesChange={vi.fn()} onApply={vi.fn()} onCancel={vi.fn()} />);
  const reset = screen.getByRole("button", { name: "Reset zoom (100%)" });
  expect(reset).toHaveTextContent(/^100%$/);
  expect(reset).toHaveAccessibleName("Reset zoom (100%)");
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(reset).toHaveTextContent("125%");
  expect(reset).toHaveAccessibleName("Reset zoom (125%)");
  fireEvent.click(reset);
  expect(reset).toHaveTextContent("100%");
  expect(reset).toHaveAccessibleName("Reset zoom (100%)");
});

it("scrolls a zoomed image without drawing and preserves Rectangle coordinates after scrolling", () => {
  const change = vi.fn(); const source = document.createElement("canvas"); source.width = 600; source.height = 1920;
  render(<AnnotationEditor source={source} shapes={[]} onShapesChange={change} onApply={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(screen.queryByRole("button", { name: "Pan" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rectangle" })).toHaveAttribute("aria-pressed", "false");
  const viewport = screen.getByRole("region", { name: "Annotation image" });
  viewport.scrollLeft = 150; viewport.scrollTop = 170;
  fireEvent.scroll(viewport);
  expect(viewport.scrollLeft).toBe(150); expect(viewport.scrollTop).toBe(170);
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
  const draw = screen.getByLabelText("Draw annotations");
  vi.spyOn(draw, "getBoundingClientRect").mockReturnValue({ left: -150, top: -170, width: 600, height: 1920 } as DOMRect);
  fireEvent.pointerDown(draw, { pointerId: 6, button: 0, clientX: 10, clientY: 20 });
  fireEvent.pointerUp(draw, { pointerId: 6, clientX: 100, clientY: 120 });
  expect(change).toHaveBeenCalledWith([{ kind: "rect", color: "red", a: { x: 160, y: 190 }, b: { x: 250, y: 290 } }]);
  expect(draw).toHaveStyle({ touchAction: "none" });
  fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
  expect(draw).toHaveStyle({ touchAction: "pan-x pan-y" });
  expect(screen.getByRole("button", { name: "Rectangle" })).toHaveAttribute("aria-pressed", "false");
});

it("keeps the source and shapes after a bounded export refusal", async () => {
  vi.mocked(exportAnnotatedImage).mockRejectedValueOnce(new Error("ลดขนาดรูปให้ไม่เกิน 2 MiB ไม่ได้"));
  const apply = vi.fn(); const change = vi.fn(); const source = document.createElement("canvas"); source.width = source.height = 100;
  render(<AnnotationEditor source={source} shapes={[shape]} onShapesChange={change} onApply={apply} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Apply annotation" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("2 MiB"));
  expect(change).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Draw annotations")).toHaveAttribute("width", "100");
  expect(screen.getByRole("button", { name: "Apply annotation" })).toBeEnabled();
});

it("does not apply a delayed export after the parent discards/unmounts the editor", async () => {
  let exported!: (blob: Blob) => void;
  vi.mocked(exportAnnotatedImage).mockImplementationOnce(() => new Promise((resolve) => { exported = resolve; }));
  const apply = vi.fn(); const busy = vi.fn(); const source = document.createElement("canvas"); source.width = source.height = 100;
  const { unmount } = render(<AnnotationEditor source={source} shapes={[shape]} onShapesChange={vi.fn()} onApply={apply} onCancel={vi.fn()} onBusyChange={busy} />);
  fireEvent.click(screen.getByRole("button", { name: "Apply annotation" })); unmount(); exported(new Blob(["ready"], { type: "image/webp" }));
  await waitFor(() => expect(exportAnnotatedImage).toHaveBeenCalled());
  expect(apply).not.toHaveBeenCalled(); expect(busy).toHaveBeenCalledTimes(1);
});
