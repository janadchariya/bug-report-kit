import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/src/test/render";
import { createBugAction, attachBugPdfAction } from "@/app/actions/bugs";
import { BugPdfSlot } from "./bug-pdf";
import { BugReportWidget } from "./bug-report-widget";
import { Toaster } from "@/src/components/ui/toaster";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/bugs", () => ({ createBugAction: vi.fn(), attachBugPdfAction: vi.fn(), removeBugPdfAction: vi.fn() }));
vi.mock("@/src/components/shell/nav-badges", () => ({ useRefreshNavCounts: () => refresh }));
vi.mock("@/src/lib/bugs/prepare-image", () => ({ prepareImage: vi.fn(), exportAnnotatedImage: vi.fn() }));
import { prepareImage, exportAnnotatedImage } from "@/src/lib/bugs/prepare-image";

const output = new Blob(["encoded"], { type: "image/webp" });
let source: HTMLCanvasElement;
async function attachImage() {
  fireEvent.change(screen.getByLabelText("Choose image"), { target: { files: [new File(["raw"], "shot.png", { type: "image/png" })] } });
  await screen.findByLabelText("Draw annotations");
}


beforeEach(() => {
  vi.mocked(createBugAction).mockReset(); vi.mocked(attachBugPdfAction).mockReset(); refresh.mockReset(); localStorage.clear();
  localStorage.setItem("bug-report-kit.coachmarkSeen", "1");
  source = document.createElement("canvas"); source.width = 800; source.height = 600;
  vi.mocked(prepareImage).mockReset().mockResolvedValue(source);
  vi.mocked(exportAnnotatedImage).mockReset().mockResolvedValue(output);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), closePath: vi.fn(), fill: vi.fn(), ellipse: vi.fn() } as unknown as CanvasRenderingContext2D);
});
afterEach(() => { vi.restoreAllMocks(); });

it("requires reporting permission and opens a single accessible refresh-held dialog", () => {
  const view = renderApp(<BugReportWidget canReportBugs={false} />);
  expect(screen.queryByRole("button", { name: "Report a bug" })).not.toBeInTheDocument();
  view.rerender(<BugReportWidget canReportBugs />);
  fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  const dialog = screen.getByRole("dialog", { name: "Report a bug" });
  expect(dialog).toHaveAttribute("data-refresh-hold");
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Report a bug" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Summary")).toHaveFocus();
  expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();
});

it("confirms discard on Escape, keeps memory drafts when refused, and returns focus after discard", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  renderApp(<BugReportWidget canReportBugs />);
  const trigger = screen.getByRole("button", { name: "Report a bug" }); fireEvent.click(trigger);
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "My draft" } });
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByLabelText("Summary")).toHaveValue("My draft");
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(trigger); expect(screen.getByLabelText("Summary")).toHaveValue("");
  confirm.mockRestore();
});

it("flattens on Send, retains retry key/draft on uncertain failure, then clears after success", async () => {
  vi.mocked(createBugAction).mockRejectedValueOnce(new Error("Synthetic disconnect")).mockResolvedValueOnce({ ok: true, data: { id: "report-1" } });
  const stored = vi.spyOn(Storage.prototype, "setItem");
  const view = renderApp(<BugReportWidget canReportBugs />);
  fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "  Save failed  " } });
  await attachImage();
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ลองส่งอีกครั้ง");
  const first = vi.mocked(createBugAction).mock.calls[0][0] as FormData;
  expect(first.get("summary")).toBe("Save failed"); expect(first.get("image")).toBeInstanceOf(File);
  expect(exportAnnotatedImage).toHaveBeenCalledTimes(1);
  view.rerender(<BugReportWidget canReportBugs />);
  expect(screen.getByLabelText("Summary")).toHaveValue("  Save failed  ");
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const second = vi.mocked(createBugAction).mock.calls[1][0] as FormData;
  expect(second.get("requestId")).toBe(first.get("requestId")); expect(refresh).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  expect(screen.getByLabelText("Summary")).toHaveValue(""); expect(stored.mock.calls.every(([key]) => key === "bug-report-kit.coachmarkSeen")).toBe(true); stored.mockRestore();
});

it("prevents duplicate submit and closing while pending, preserving a refused result", async () => {
  const user = userEvent.setup();
  let finish!: (value: Awaited<ReturnType<typeof createBugAction>>) => void;
  vi.mocked(createBugAction).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  renderApp(<BugReportWidget canReportBugs />); fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Pending" } });
  await attachImage();
  act(() => screen.getByLabelText("Summary").focus());
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByRole("dialog")).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("dialog")).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByRole("dialog")).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" }); expect(screen.getByRole("dialog")).toBeInTheDocument();
  await act(async () => finish({ ok: false, code: "rule", reasonCode: "bug_report_rate_limited", correlationId: "test" }));
  expect(screen.getByLabelText("Summary")).toHaveValue("Pending"); expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});

it("explains the shared image quota in Thai and keeps the report draft after refusal", async () => {
  vi.mocked(createBugAction).mockResolvedValueOnce({ ok: false, code: "rule", reasonCode: "bug_image_quota_exceeded", correlationId: "test" });
  renderApp(<BugReportWidget canReportBugs />);
  fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Image quota draft" } });
  await attachImage();
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ใช้โควตาแนบไฟล์ครบ 50 MiB ใน 24 ชั่วโมงแล้ว");
  expect(screen.getByLabelText("Summary")).toHaveValue("Image quota draft");
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});

it("retries the original payload after an uncertain save and preserves newer edits for a new report", async () => {
  vi.mocked(createBugAction).mockRejectedValueOnce(new Error("Response lost"))
    .mockResolvedValueOnce({ ok: true, data: { id: "first-report" } })
    .mockResolvedValueOnce({ ok: true, data: { id: "second-report" } });
  renderApp(<BugReportWidget canReportBugs />);
  fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Original report" } });
  await attachImage();
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByRole("alert");
  const original = vi.mocked(createBugAction).mock.calls[0][0] as FormData;
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Newer draft" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Add details" }));
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "New details" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(createBugAction).toHaveBeenCalledTimes(2));
  const replay = vi.mocked(createBugAction).mock.calls[1][0] as FormData;
  expect(replay.get("requestId")).toBe(original.get("requestId"));
  expect(replay.get("summary")).toBe("Original report");
  expect(replay.get("description")).toBe("");
  await waitFor(() => expect(screen.getByLabelText("Summary")).toHaveValue("Newer draft"));
  expect(screen.getByLabelText("Description")).toHaveValue("New details");
  expect(screen.getByText(/ข้อมูลที่แก้ไขยังอยู่/)).toHaveAttribute("role", "status");
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(createBugAction).toHaveBeenCalledTimes(3));
  const next = vi.mocked(createBugAction).mock.calls[2][0] as FormData;
  expect(next.get("requestId")).not.toBe(original.get("requestId"));
  expect(next.get("summary")).toBe("Newer draft");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("blocks Send while decoding or flattening without requiring an Apply step", async () => {
  let decoded!: (canvas: HTMLCanvasElement) => void;
  vi.mocked(prepareImage).mockImplementationOnce(() => new Promise((resolve) => { decoded = resolve; }));
  renderApp(<BugReportWidget canReportBugs />); fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Image issue" } });
  fireEvent.change(screen.getByLabelText("Choose image"), { target: { files: [new File(["x"], "x.png", { type: "image/png" })] } });
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await act(async () => decoded(source));
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Apply annotation" })).not.toBeInTheDocument();
  let flattened!: (blob: Blob) => void;
  vi.mocked(exportAnnotatedImage).mockImplementationOnce(() => new Promise((resolve) => { flattened = resolve; }));
  vi.mocked(createBugAction).mockResolvedValueOnce({ ok: true, data: { id: "flattened" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  expect(createBugAction).not.toHaveBeenCalled();
  await act(async () => flattened(output));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("allows correcting a definitely refused report instead of replaying invalid input", async () => {
  vi.mocked(createBugAction).mockResolvedValueOnce({ ok: false, code: "invalid_input", reasonCode: null, correlationId: "test" })
    .mockResolvedValueOnce({ ok: true, data: { id: "corrected" } });
  renderApp(<BugReportWidget canReportBugs />);
  fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Rejected input" } });
  await attachImage();
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByRole("alert");
  const first = vi.mocked(createBugAction).mock.calls[0][0] as FormData;
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Corrected input" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(createBugAction).toHaveBeenCalledTimes(2));
  const corrected = vi.mocked(createBugAction).mock.calls[1][0] as FormData;
  expect(corrected.get("summary")).toBe("Corrected input");
  expect(corrected.get("requestId")).not.toBe(first.get("requestId"));
});

it("requires a screenshot as well as summary and shows live counters and collapsed details", async () => {
  renderApp(<BugReportWidget canReportBugs />); fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();
  expect(screen.queryByRole("toolbar", { name: "Annotation tools" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Save fails" } });
  expect(screen.getByText("10/200")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("button", { name: "Send" }).closest("form")!);
  expect(createBugAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "+ Add details" }));
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Steps" } });
  expect(screen.getByText("5/4000")).toBeInTheDocument();
  await attachImage();
  expect(screen.getByRole("toolbar", { name: "Annotation tools" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});

it("routes window image paste while Summary has focus, leaving text paste alone and cleaning up", async () => {
  const view = renderApp(<BugReportWidget canReportBugs />); fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  const image = new File(["raw"], "shot.gif", { type: "image/gif" });
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { files: [], items: [{ kind: "file", type: "image/gif", getAsFile: () => image }] } });
  fireEvent(screen.getByLabelText("Summary"), event);
  await screen.findByLabelText("Draw annotations");
  expect(event.defaultPrevented).toBe(true); expect(prepareImage).toHaveBeenCalledWith(image, expect.any(AbortSignal));
  const text = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(text, "clipboardData", { value: { files: [], items: [{ kind: "string", type: "text/plain" }] } });
  fireEvent(screen.getByLabelText("Summary"), text); expect(text.defaultPrevented).toBe(false);
  view.unmount();
  const closed = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(closed, "clipboardData", { value: (event as ClipboardEvent).clipboardData });
  fireEvent(window, closed); expect(closed.defaultPrevented).toBe(false);
});

it("drops images over the dialog header and guards file navigation outside the dialog", async () => {
  renderApp(<BugReportWidget canReportBugs />); fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  const file = new File(["raw"], "shot.png", { type: "image/png" });
  fireEvent.drop(screen.getByRole("heading", { name: "Report a bug" }), { dataTransfer: { types: ["Files"], files: [file], items: [] } });
  await screen.findByLabelText("Draw annotations");
  const outside = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(outside, "dataTransfer", { value: { types: ["Files"], files: [file], items: [] } });
  fireEvent(window, outside); expect(outside.defaultPrevented).toBe(true);
  expect(prepareImage).toHaveBeenCalledTimes(1);
});

it("zooms only outside typing controls and undoes live annotation with the keyboard", async () => {
  renderApp(<BugReportWidget canReportBugs />); fireEvent.click(screen.getByRole("button", { name: "Report a bug" })); await attachImage();
  const summary = screen.getByLabelText("Summary");
  fireEvent.keyDown(summary, { key: "+" }); expect(screen.getByText("100%")).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "+" }); expect(screen.getByText("125%")).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "0" }); expect(screen.getByText("100%")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
  const layer = screen.getByLabelText("Draw annotations");
  vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect);
  fireEvent.pointerDown(layer, { pointerId: 1, button: 0, clientX: 10, clientY: 20 });
  fireEvent.pointerUp(layer, { pointerId: 1, clientX: 100, clientY: 120 });
  expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
  fireEvent.keyDown(summary, { key: "z", ctrlKey: true }); expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
  fireEvent.keyDown(document, { key: "z", ctrlKey: true }); expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
});

it("keeps the draft on flatten failure and never calls the server with an unfinished image", async () => {
  renderApp(<BugReportWidget canReportBugs />); fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "My screenshot" } }); await attachImage();
  vi.mocked(exportAnnotatedImage).mockRejectedValueOnce(new Error("ลดขนาดรูปให้ไม่เกิน 2 MiB ไม่ได้"));
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("2 MiB");
  expect(screen.getByLabelText("Summary")).toHaveValue("My screenshot");
  expect(screen.getByLabelText("Draw annotations")).toBeInTheDocument(); expect(createBugAction).not.toHaveBeenCalled();
});

it("offers the separate PDF attachment control while still requiring a screenshot", () => {
  renderApp(<BugReportWidget canReportBugs />); fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  expect(screen.getByText("PDF attachment (optional)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Attach PDF" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
});

it("shows an icon-only success FAB for 1.5 seconds and keeps the report link toast", async () => {
  vi.mocked(createBugAction).mockResolvedValueOnce({ ok: true, data: { id: "saved" } });
  renderApp(<><BugReportWidget canReportBugs /><Toaster /></>);
  const trigger = screen.getByRole("button", { name: "Report a bug" });
  expect(trigger).toHaveTextContent("");
  expect(trigger).toHaveClass("bug-report-trigger");
  fireEvent.click(trigger);
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Saved" } }); await attachImage();
  vi.useFakeTimers();
  try {
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send" })); });
    expect(trigger).toHaveAttribute("data-sent", "true");
    expect(screen.getByRole("link", { name: "บันทึกรายงานแล้ว" })).toHaveAttribute("href", "/bugs/mine/saved");
    act(() => { vi.advanceTimersByTime(1499); }); expect(trigger).toHaveAttribute("data-sent", "true");
    act(() => { vi.advanceTimersByTime(1); }); expect(trigger).toHaveAttribute("data-sent", "false");
  } finally { vi.useRealTimers(); }
});


it("confirms discarding a PDF-only draft and retains it when discard is refused", () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  renderApp(<BugReportWidget canReportBugs />);
  fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  fireEvent.change(screen.getByLabelText("Choose PDF"), { target: { files: [new File(["%PDF-"], "draft.pdf", { type: "application/pdf" })] } });
  fireEvent.keyDown(document, { key: "Escape" });
  expect(window.confirm).toHaveBeenCalledOnce();
  expect(screen.getByText("draft.pdf")).toBeInTheDocument();
});

it("saves the report before a separate PDF upload and retries the exact file from detail without recreating the report", async () => {
  const reportId = "99999999-9999-4999-8999-999999999999";
  const pdfId = "88888888-8888-4888-8888-888888888888";
  const pdfMeta = { id: pdfId, kind: "report_pdf" as const, mimeType: "application/pdf" as const, fileName: "report.pdf", byteCount: 8, removed: false, url: `/api/bugs/files/${pdfId}` };
  vi.mocked(createBugAction).mockResolvedValueOnce({ ok: true, data: { id: reportId } });
  vi.mocked(attachBugPdfAction).mockRejectedValueOnce(new Error("unknown upload")).mockResolvedValueOnce({ ok: true, data: pdfMeta });
  const view = renderApp(<BugReportWidget canReportBugs />);
  fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "Report with PDF" } });
  await attachImage();
  const pdf = new File(["%PDF-1.7"], "report.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Choose PDF"), { target: { files: [pdf] } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const reportForm = vi.mocked(createBugAction).mock.calls[0][0] as FormData;
  expect(reportForm.get("pdf")).toBeNull();
  const first = vi.mocked(attachBugPdfAction).mock.calls[0][0] as FormData;
  expect(first.get("bugId")).toBe(reportId);
  expect(first.get("pdf")).toBe(pdf);
  expect(createBugAction).toHaveBeenCalledTimes(1);
  view.rerender(<BugPdfSlot bugId={reportId} pdf={null} snapshot={{}} canRemove={false} canUpload />);
  await userEvent.click(screen.getByRole("button", { name: "Retry PDF upload" }));
  expect(await screen.findByRole("link", { name: /ไฟล์ PDF/ })).toHaveAttribute("href", pdfMeta.url);
  const replay = vi.mocked(attachBugPdfAction).mock.calls[1][0] as FormData;
  expect(replay.get("requestId")).toBe(first.get("requestId"));
  expect(replay.get("pdf")).toBe(pdf);
  expect(createBugAction).toHaveBeenCalledTimes(1);
});
