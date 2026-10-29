import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { exportAnnotatedImage, prepareImage } from "@/src/lib/bugs/prepare-image";
import { ImageInput } from "./image-input";

vi.mock("@/src/lib/bugs/prepare-image", () => ({ prepareImage: vi.fn(), exportAnnotatedImage: vi.fn() }));
let source: HTMLCanvasElement;
const output = new Blob(["prepared"], { type: "image/webp" });
beforeEach(() => {
  vi.stubGlobal("PointerEvent", class extends MouseEvent { pointerId: number; constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; } });
  source = document.createElement("canvas"); source.width = 1920; source.height = 1000;
  vi.mocked(prepareImage).mockResolvedValue(source); vi.mocked(exportAnnotatedImage).mockResolvedValue(output);
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn() } as unknown as CanvasRenderingContext2D);
});
afterEach(() => { vi.resetAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(["picker", "drop", "paste"])("prepares %s images through the same report/comment pipeline", async (method) => {
  const change = vi.fn(); render(<ImageInput value={null} onChange={change} />);
  const file = new File(["raw"], "screenshot.png", { type: "image/png" });
  if (method === "picker") fireEvent.change(screen.getByLabelText("Attach image"), { target: { files: [file] } });
  else if (method === "drop") fireEvent.drop(screen.getByRole("region", { name: "Image attachment" }), { dataTransfer: { files: [file], items: [] } });
  else fireEvent.paste(screen.getByRole("region", { name: "Image attachment" }), { clipboardData: { files: [file], items: [] } });
  await waitFor(() => expect(change).toHaveBeenCalledWith(output));
  expect(prepareImage).toHaveBeenCalledWith(file, expect.any(AbortSignal)); expect(exportAnnotatedImage).toHaveBeenCalledWith(source);
});

it("leaves ordinary text paste and paste outside its active region alone", () => {
  render(<><textarea aria-label="Comment" /><ImageInput value={null} onChange={vi.fn()} /></>);
  const outside = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(outside, "clipboardData", { value: { files: [new File(["x"], "x.png", { type: "image/png" })], items: [] } });
  fireEvent(screen.getByLabelText("Comment"), outside);
  const text = new Event("paste", { bubbles: true, cancelable: true }); Object.defineProperty(text, "clipboardData", { value: { files: [], items: [] } });
  fireEvent(screen.getByRole("region", { name: "Image attachment" }), text);
  expect(outside.defaultPrevented).toBe(false); expect(text.defaultPrevented).toBe(false); expect(prepareImage).not.toHaveBeenCalled();
});

it.each(["dragover", "drop"])("prevents browser navigation for file %s anywhere while mounted and cleans up on unmount", (type) => {
  const { unmount } = render(<><textarea aria-label="Comment" /><ImageInput value={null} onChange={vi.fn()} /></>);
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], files: [], items: [] } });
  fireEvent(screen.getByLabelText("Comment"), event);
  expect(event.defaultPrevented).toBe(true);
  expect(prepareImage).not.toHaveBeenCalled();
  unmount();
  const afterUnmount = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(afterUnmount, "dataTransfer", { value: { types: ["Files"], files: [], items: [] } });
  fireEvent(window, afterUnmount);
  expect(afterUnmount.defaultPrevented).toBe(false);
});

it.each(["dragover", "drop"])("leaves text and URL %s alone inside and outside the attachment region", (type) => {
  render(<><textarea aria-label="Comment" /><ImageInput value={null} onChange={vi.fn()} /></>);
  for (const target of [screen.getByLabelText("Comment"), screen.getByRole("region", { name: "Image attachment" })]) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { types: ["text/plain", "text/uri-list"], files: [], items: [] } });
    fireEvent(target, event);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(prepareImage).not.toHaveBeenCalled();
});

it("preserves an existing attachment when decode fails", async () => {
  const change = vi.fn(); vi.mocked(prepareImage).mockRejectedValueOnce(new Error("เปิดรูปไม่ได้ กรุณาเลือกรูปใหม่"));
  render(<ImageInput value={output} onChange={change} />);
  fireEvent.change(screen.getByLabelText("Attach image"), { target: { files: [new File(["bad"], "bad.png", { type: "image/png" })] } });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("เปิดรูปไม่ได้"));
  expect(change).not.toHaveBeenCalled(); expect(screen.getByRole("img", { name: "Attached image preview" })).toBeInTheDocument();
});

it.each(["decode", "export"])("preserves the editable source and applied shapes when replacement %s fails", async (failure) => {
  function Form() {
    const [image, setImage] = useState<Blob | null>(output);
    return <ImageInput value={image} onChange={setImage} />;
  }
  render(<Form />);
  fireEvent.click(screen.getByRole("button", { name: "Annotate" }));
  const layer = await screen.findByLabelText("Draw annotations");
  fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
  vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1920, height: 1000 } as DOMRect);
  fireEvent.pointerDown(layer, { pointerId: 1, button: 0, clientX: 10, clientY: 20 });
  fireEvent.pointerUp(layer, { pointerId: 1, clientX: 100, clientY: 120 });
  fireEvent.click(screen.getByRole("button", { name: "Apply annotation" }));
  await screen.findByRole("img", { name: "Attached image preview" });

  const replacement = document.createElement("canvas"); replacement.width = 400; replacement.height = 800;
  if (failure === "decode") vi.mocked(prepareImage).mockRejectedValueOnce(new Error("เปิดรูปไม่ได้"));
  else { vi.mocked(prepareImage).mockResolvedValueOnce(replacement); vi.mocked(exportAnnotatedImage).mockRejectedValueOnce(new Error("ลดขนาดรูปให้ไม่เกิน 2 MiB ไม่ได้")); }
  fireEvent.change(screen.getByLabelText("Attach image"), { target: { files: [new File(["replacement"], "replacement.png", { type: "image/png" })] } });
  await screen.findByRole("alert");
  expect(screen.getByRole("img", { name: "Attached image preview" })).toHaveAttribute("src", "blob:preview");

  fireEvent.click(screen.getByRole("button", { name: "Annotate" }));
  expect(screen.getByLabelText("Draw annotations")).toHaveAttribute("width", "1920");
  expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel annotation" }));
  fireEvent.click(screen.getByRole("button", { name: "Annotate" }));
  expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Apply annotation" }));
  await screen.findByRole("img", { name: "Attached image preview" });
  expect(exportAnnotatedImage).toHaveBeenLastCalledWith(source, [{ kind: "rect", color: "red", a: { x: 10, y: 20 }, b: { x: 100, y: 120 } }], expect.any(Object));
});

it("revokes preview URLs on replacement, removal and unmount", async () => {
  const change = vi.fn(); const { rerender, unmount } = render(<ImageInput value={output} onChange={change} />);
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledWith(output));
  const next = new Blob(["next"], { type: "image/png" }); rerender(<ImageInput value={next} onChange={change} />);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  fireEvent.click(screen.getByRole("button", { name: "Remove image" })); expect(change).toHaveBeenCalledWith(null);
  rerender(<ImageInput value={null} onChange={change} />);
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  rerender(<ImageInput value={next} onChange={change} />); unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
});

it("blocks disabled input, drop and paste without erasing the draft", () => {
  render(<ImageInput value={output} onChange={vi.fn()} disabled />);
  expect(screen.getByLabelText("Attach image")).toBeDisabled();
  fireEvent.drop(screen.getByRole("region", { name: "Image attachment" }), { dataTransfer: { files: [new File(["x"], "x.png", { type: "image/png" })], items: [] } });
  expect(prepareImage).not.toHaveBeenCalled();
});

it("restores a live preview URL after cancelling annotation without changing the attachment", async () => {
  render(<ImageInput value={output} onChange={vi.fn()} />);
  expect(screen.getByRole("img", { name: "Attached image preview" })).toHaveAttribute("src", "blob:preview");
  fireEvent.click(screen.getByRole("button", { name: "Annotate" }));
  await screen.findByRole("region", { name: "Annotation editor" });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  fireEvent.click(screen.getByRole("button", { name: "Cancel annotation" }));
  expect(screen.getByRole("img", { name: "Attached image preview" })).toHaveAttribute("src", "blob:preview");
  await waitFor(() => expect(screen.getByRole("button", { name: "Annotate" })).toHaveFocus());
});

it("uses the latest parent callback after preparation so concurrent text edits survive", async () => {
  let ready!: (canvas: HTMLCanvasElement) => void;
  vi.mocked(prepareImage).mockImplementationOnce(() => new Promise((resolve) => { ready = resolve; }));
  function Form() {
    const [text, setText] = useState("Initial"); const [image, setImage] = useState<Blob | null>(null);
    return <><input aria-label="Summary" value={text} onChange={(event) => setText(event.target.value)} /><ImageInput value={image} onChange={(blob) => { setText(text); setImage(blob); }} /></>;
  }
  render(<Form />);
  fireEvent.change(screen.getByLabelText("Attach image"), { target: { files: [new File(["x"], "x.png", { type: "image/png" })] } });
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Edited during decode" } });
  ready(source);
  await waitFor(() => expect(screen.getByRole("img", { name: "Attached image preview" })).toBeInTheDocument());
  expect(screen.getByLabelText("Summary")).toHaveValue("Edited during decode");
});

it("ignores a source load resolved after the parent discards/unmounts the input", async () => {
  let ready!: (canvas: HTMLCanvasElement) => void;
  vi.mocked(prepareImage).mockImplementationOnce(() => new Promise((resolve) => { ready = resolve; }));
  const change = vi.fn(); const { unmount } = render(<ImageInput value={null} onChange={change} />);
  fireEvent.change(screen.getByLabelText("Attach image"), { target: { files: [new File(["x"], "x.png", { type: "image/png" })] } });
  unmount(); ready(source);
  await waitFor(() => expect(prepareImage).toHaveBeenCalledOnce());
  expect(vi.mocked(prepareImage).mock.calls[0][1]?.aborted).toBe(true);
  expect(exportAnnotatedImage).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled();
});
