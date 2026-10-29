import { fireEvent, render, screen } from "@testing-library/react";
import type { BugImageMeta } from "@/src/lib/bugs/types";
import { BugImageViewer } from "./bug-image-viewer";

const id = "00000000-0000-4000-8000-000000000001";
const image: BugImageMeta = { id, kind: "screenshot", width: 1920, height: 1000, mimeType: "image/webp", byteCount: 100, removed: false, url: `/api/bugs/images/${id}` };

it("loads the private authenticated route directly with zoom/reset and a download link", () => {
  render(<BugImageViewer image={image} />);
  const img = screen.getByRole("img", { name: "Bug screenshot" });
  expect(img).toHaveAttribute("src", image.url); expect(img).not.toHaveAttribute("srcset");
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" })); expect(screen.getByText("125%")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reset zoom" })); expect(screen.getByText("100%")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", image.url);
  expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("download");
  expect(screen.getByText("ลากในภาพเพื่อเลื่อนดู")).toBeInTheDocument();
});

it("scales from the image's normal rendered size so small screenshots are not enlarged to the whole pane", () => {
  render(<BugImageViewer image={{ ...image, width: 100, height: 80 }} />);
  const screenshot = screen.getByRole("img", { name: "Bug screenshot" });
  expect(screenshot.style.width).toBe("");
  expect(screenshot).toHaveStyle({ transform: "scale(1)", transformOrigin: "top left" });
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(screenshot).toHaveStyle({ transform: "scale(1.25)" });
});

it.each(["https://outside.test/image.png", "//outside.test/image.png", "data:image/png;base64,abc", "blob:private", "/_next/image?url=secret"])("refuses non-private image URL %s", (url) => {
  render(<BugImageViewer image={{ ...image, url }} />); expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Download" })).not.toBeInTheDocument();
});

it.each(["screenshot", "comment"] as const)("shows a %s tombstone without loading bytes", (kind) => {
  render(<BugImageViewer image={{ ...image, kind, removed: true }} />);
  expect(screen.getByText(kind === "screenshot" ? "Screenshot removed" : "Image removed")).toBeInTheDocument(); expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Download" })).not.toBeInTheDocument();
});

it("pans by mouse pointer capture and ends a cancelled gesture", () => {
  vi.stubGlobal("PointerEvent", class extends MouseEvent { pointerId: number; pointerType: string; constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? "mouse"; } });
  render(<BugImageViewer image={image} />);
  const viewport = screen.getByRole("region", { name: "Image viewer" });
  viewport.setPointerCapture = vi.fn(); viewport.releasePointerCapture = vi.fn(); viewport.scrollLeft = 100; viewport.scrollTop = 200;
  fireEvent.pointerDown(viewport, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 70, clientY: 60 });
  expect(viewport.scrollLeft).toBe(130); expect(viewport.scrollTop).toBe(240);
  fireEvent.pointerCancel(viewport, { pointerId: 1 }); fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 0, clientY: 0 });
  expect(viewport.scrollLeft).toBe(130); expect(viewport.releasePointerCapture).toHaveBeenCalledWith(1);
  vi.unstubAllGlobals();
});

it.each(["touch", "pen"])("leaves %s pointer scrolling to the browser without capture or prevention", (pointerType) => {
  vi.stubGlobal("PointerEvent", class extends MouseEvent { pointerId: number; pointerType: string; constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? "mouse"; } });
  render(<BugImageViewer image={image} />);
  const viewport = screen.getByRole("region", { name: "Image viewer" });
  viewport.setPointerCapture = vi.fn(); viewport.scrollLeft = 100; viewport.scrollTop = 200;
  const start = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType, pointerId: 9, button: 0, clientX: 100, clientY: 100 });
  fireEvent(viewport, start);
  fireEvent.pointerMove(viewport, { pointerType, pointerId: 9, clientX: 70, clientY: 60 });
  expect(start.defaultPrevented).toBe(false);
  expect(viewport.setPointerCapture).not.toHaveBeenCalled();
  expect(viewport.scrollLeft).toBe(100); expect(viewport.scrollTop).toBe(200);
  vi.unstubAllGlobals();
});

it("allows native panning on both axes in the rendered viewer viewport", () => {
  render(<BugImageViewer image={image} />);
  expect(getComputedStyle(screen.getByRole("region", { name: "Image viewer" })).touchAction).toBe("pan-x pan-y");
});
