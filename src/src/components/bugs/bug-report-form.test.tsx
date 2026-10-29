import { createRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { prepareImage } from "@/src/lib/bugs/prepare-image";
vi.mock("@/src/lib/bugs/prepare-image", () => ({ prepareImage: vi.fn() }));
import { BugReportForm, type BugReportDraft } from "./bug-report-form";

beforeEach(() => {
  const matchMedia = window.matchMedia;
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ ...matchMedia(query), matches: query === "(pointer: coarse)" }));
  vi.stubGlobal("PointerEvent", class extends MouseEvent { pointerId: number; constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; } });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn() } as unknown as CanvasRenderingContext2D);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("opens an image ready to scroll, selects a drawing tool, then returns to scrolling without losing marks", () => {
  const source = document.createElement("canvas"); source.width = source.height = 100;
  const submit = vi.fn();
  function Composer() {
    const [draft, setDraft] = useState<BugReportDraft>({ summary: "Synthetic screenshot", description: "", image: source, shapes: [] });
    return <BugReportForm draft={draft} onChange={setDraft} pending={false} imageBusy={false} onBusyChange={vi.fn()} error={null} onSubmit={() => submit(draft)} onCancel={vi.fn()} summaryRef={createRef()} />;
  }
  render(<Composer />);
  const draw = screen.getByLabelText("Draw annotations");
  expect(screen.getByRole("button", { name: "Rectangle" })).toHaveAttribute("aria-pressed", "false");
  expect(draw).toHaveStyle({ touchAction: "pan-x pan-y" });
  fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
  expect(draw).toHaveStyle({ touchAction: "none" });
  vi.spyOn(draw, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
  fireEvent.pointerDown(draw, { pointerId: 6, button: 0, clientX: 10, clientY: 20 });
  fireEvent.pointerUp(draw, { pointerId: 6, clientX: 50, clientY: 70 });
  expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
  expect(draw).toHaveStyle({ touchAction: "pan-x pan-y" });
  fireEvent.pointerDown(draw, { pointerId: 7, button: 0, clientX: 20, clientY: 30 });
  fireEvent.pointerUp(draw, { pointerId: 7, clientX: 80, clientY: 90 });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ shapes: [{ kind: "rect", color: "red", a: { x: 10, y: 20 }, b: { x: 50, y: 70 } }] }));
});

it("attaches, validates, pastes and removes a report PDF without changing the screenshot", () => {
  const source = document.createElement("canvas"); source.width = source.height = 100;
  function Composer() {
    const [draft, setDraft] = useState<BugReportDraft>({ summary: "PDF evidence", description: "", image: source, shapes: [] });
    return <BugReportForm draft={draft} onChange={setDraft} pending={false} imageBusy={false} onBusyChange={vi.fn()} error={null} onSubmit={vi.fn()} onCancel={vi.fn()} summaryRef={createRef()} />;
  }
  render(<Composer />);
  expect(screen.getByRole("button", { name: "Attach PDF" })).toBeEnabled();
  const pdf = new File(["%PDF-1.7"], "evidence.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Choose PDF"), { target: { files: [pdf] } });
  expect(screen.getByText("evidence.pdf")).toBeInTheDocument();
  expect(screen.getByLabelText("Draw annotations")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Choose PDF"), { target: { files: [new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" })] } });
  expect(screen.getByRole("alert")).toHaveTextContent("4 MiB");
  expect(screen.getByText("evidence.pdf")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove PDF" }));
  expect(screen.queryByText("evidence.pdf")).not.toBeInTheDocument();
  fireEvent.paste(window, { clipboardData: { items: [{ kind: "file", type: pdf.type, getAsFile: () => pdf }] } });
  expect(screen.getByText("evidence.pdf")).toBeInTheDocument();
  expect(screen.getByLabelText("Draw annotations")).toBeInTheDocument();
});


it("keeps both files when one paste contains a screenshot and a PDF", async () => {
  const source = document.createElement("canvas"); source.width = source.height = 100;
  vi.mocked(prepareImage).mockResolvedValueOnce(source);
  function Composer() {
    const [draft, setDraft] = useState<BugReportDraft>({ summary: "Mixed evidence", description: "", image: null, shapes: [] });
    return <BugReportForm draft={draft} onChange={setDraft} pending={false} imageBusy={false} onBusyChange={vi.fn()} error={null} onSubmit={vi.fn()} onCancel={vi.fn()} summaryRef={createRef()} />;
  }
  render(<Composer />);
  const image = new File(["image"], "paste.png", { type: "image/png" });
  const pdf = new File(["%PDF-1.7"], "mixed.pdf", { type: "application/pdf" });
  fireEvent.paste(window, { clipboardData: { items: [image, pdf].map((file) => ({ kind: "file", type: file.type, getAsFile: () => file })) } });
  await waitFor(() => expect(screen.getByLabelText("Draw annotations")).toBeInTheDocument());
  expect(screen.getByText("mixed.pdf")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});

it("defaults a fine pointer to Rectangle and keeps a repeated click selected without the touch hint", () => {
  vi.mocked(window.matchMedia).mockImplementation((query) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  const source = document.createElement("canvas"); source.width = source.height = 100;
  function Composer() {
    const [draft, setDraft] = useState<BugReportDraft>({ summary: "Fine pointer", description: "", image: source, shapes: [] });
    return <BugReportForm draft={draft} onChange={setDraft} pending={false} imageBusy={false} onBusyChange={vi.fn()} error={null} onSubmit={vi.fn()} onCancel={vi.fn()} summaryRef={createRef()} />;
  }
  render(<Composer />);
  const rectangle = screen.getByRole("button", { name: "Rectangle" });
  expect(rectangle).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("Draw annotations")).toHaveStyle({ touchAction: "none" });
  fireEvent.click(rectangle);
  expect(rectangle).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByText(/กดเครื่องมือที่เลือกซ้ำเพื่อเลื่อนภาพ/)).not.toBeInTheDocument();
});

it("restores focus after an attachment replaces Choose image and after Change image restores it", async () => {
  const source = document.createElement("canvas"); source.width = source.height = 100;
  vi.mocked(prepareImage).mockResolvedValueOnce(source);
  function Composer() {
    const [draft, setDraft] = useState<BugReportDraft>({ summary: "Focus retained", description: "", image: null, shapes: [] });
    const [busy, setBusy] = useState(false);
    return <BugReportForm draft={draft} onChange={setDraft} pending={false} imageBusy={busy} onBusyChange={setBusy} error={null} onSubmit={vi.fn()} onCancel={vi.fn()} summaryRef={createRef()} />;
  }
  render(<Composer />);
  screen.getByRole("button", { name: "Choose image" }).focus();
  fireEvent.change(screen.getByLabelText("Choose image"), { target: { files: [new File(["image"], "focus.png", { type: "image/png" })] } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Change image" })).toHaveFocus());
  fireEvent.click(screen.getByRole("button", { name: "Change image" }));
  expect(screen.getByRole("button", { name: "Choose image" })).toHaveFocus();
});

it.each(["image/heic", "image/svg+xml", "image/bmp"])("reports unsupported pasted and dropped %s images", (type) => {
  const draft: BugReportDraft = { summary: "Unsupported", description: "", image: null, shapes: [] };
  const form = <div className="bug-report-dialog"><BugReportForm draft={draft} onChange={vi.fn()} pending={false} imageBusy={false} onBusyChange={vi.fn()} error={null} onSubmit={vi.fn()} onCancel={vi.fn()} summaryRef={createRef()} /></div>;
  const view = render(form);
  const file = new File(["image"], "unsupported", { type });
  fireEvent.paste(window, { clipboardData: { items: [{ kind: "file", type, getAsFile: () => file }] } });
  expect(screen.getByRole("alert")).toHaveTextContent("รองรับเฉพาะรูปภาพ (PNG / JPG / WebP / GIF)");
  view.unmount();
  render(form);
  fireEvent.drop(screen.getByRole("button", { name: "Choose image" }), { dataTransfer: { types: ["Files"], files: [file] } });
  expect(screen.getByRole("alert")).toHaveTextContent("รองรับเฉพาะรูปภาพ (PNG / JPG / WebP / GIF)");
});

it("explains an unsupported HEIC drop even when the browser omits its MIME type", () => {
  const draft: BugReportDraft = { summary: "HEIC evidence", description: "", image: null, shapes: [] };
  render(<div className="bug-report-dialog"><BugReportForm draft={draft} onChange={vi.fn()} pending={false} imageBusy={false} onBusyChange={vi.fn()} error={null} onSubmit={vi.fn()} onCancel={vi.fn()} summaryRef={createRef()} /></div>);
  fireEvent.drop(screen.getByRole("button", { name: "Choose image" }), { dataTransfer: { types: ["Files"], files: [new File(["image"], "screenshot.HEIC")] } });
  expect(screen.getByRole("alert")).toHaveTextContent("รองรับเฉพาะรูปภาพ (PNG / JPG / WebP / GIF)");
});

it("resets the dropzone when a file drag leaves the window or ends", () => {
  const draft: BugReportDraft = { summary: "Drag state", description: "", image: null, shapes: [] };
  const view = render(<div className="bug-report-dialog"><BugReportForm draft={draft} onChange={vi.fn()} pending={false} imageBusy={false} onBusyChange={vi.fn()} error={null} onSubmit={vi.fn()} onCancel={vi.fn()} summaryRef={createRef()} /></div>);
  const zone = view.container.querySelector(".bug-report-dropzone")!;
  fireEvent.dragOver(zone, { dataTransfer: { types: ["Files"] } });
  expect(zone).toHaveAttribute("data-dragging", "true");
  fireEvent.dragLeave(window, { relatedTarget: null });
  expect(zone).toHaveAttribute("data-dragging", "false");
  fireEvent.dragOver(zone, { dataTransfer: { types: ["Files"] } });
  fireEvent.dragEnd(window);
  expect(zone).toHaveAttribute("data-dragging", "false");
  fireEvent.dragOver(zone, { dataTransfer: { types: ["Files"] } });
  fireEvent.drop(window);
  expect(zone).toHaveAttribute("data-dragging", "false");
});

it("clears the file-drag highlight when moving from the dialog header to its backdrop", () => {
  const draft: BugReportDraft = { summary: "Backdrop drag", description: "", image: null, shapes: [] };
  const view = render(<div className="ui-dialog-backdrop"><div className="bug-report-dialog"><h2>Report a bug</h2><BugReportForm draft={draft} onChange={vi.fn()} pending={false} imageBusy={false} onBusyChange={vi.fn()} error={null} onSubmit={vi.fn()} onCancel={vi.fn()} summaryRef={createRef()} /></div></div>);
  const zone = view.container.querySelector(".bug-report-dropzone")!;
  const backdrop = view.container.querySelector(".ui-dialog-backdrop")!;
  fireEvent.dragOver(screen.getByRole("heading", { name: "Report a bug" }), { dataTransfer: { types: ["Files"] } });
  expect(zone).toHaveAttribute("data-dragging", "true");
  fireEvent.dragOver(backdrop, { dataTransfer: { types: ["Files"] } });
  expect(zone).toHaveAttribute("data-dragging", "false");
});

it("keeps Ctrl/Cmd+Shift+Z from removing an annotation", () => {
  const source = document.createElement("canvas"); source.width = source.height = 100;
  const change = vi.fn();
  const draft: BugReportDraft = { summary: "Undo", description: "", image: source, shapes: [{ kind: "rect", color: "red", a: { x: 1, y: 1 }, b: { x: 20, y: 20 } }] };
  render(<BugReportForm draft={draft} onChange={change} pending={false} imageBusy={false} onBusyChange={vi.fn()} error={null} onSubmit={vi.fn()} onCancel={vi.fn()} summaryRef={createRef()} />);
  fireEvent.keyDown(document, { key: "z", ctrlKey: true, shiftKey: true });
  fireEvent.keyDown(document, { key: "z", metaKey: true, shiftKey: true });
  expect(change).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "z", ctrlKey: true });
  expect(change).toHaveBeenCalledExactlyOnceWith({ ...draft, shapes: [] });
});
