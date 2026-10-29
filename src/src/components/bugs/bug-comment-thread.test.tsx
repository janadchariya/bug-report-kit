import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { addBugCommentAction, loadBugThreadAction, removeBugImageAction, attachBugPdfAction } from "@/app/actions/bugs";
import { exportAnnotatedImage, prepareImage } from "@/src/lib/bugs/prepare-image";
import { AutoRefresh } from "@/src/components/shell/auto-refresh";
import type { BugComment, BugImageMeta } from "@/src/lib/bugs/types";
import { BugCommentThread } from "./bug-comment-thread";

vi.mock("@/app/actions/bugs", () => ({ addBugCommentAction: vi.fn(), loadBugThreadAction: vi.fn(), removeBugImageAction: vi.fn(), attachBugPdfAction: vi.fn(), removeBugPdfAction: vi.fn() }));
const { router, refreshCounts } = vi.hoisted(() => ({ router: { refresh: vi.fn() }, refreshCounts: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/src/components/shell/nav-badges", () => ({
  useRefreshNavCounts: () => refreshCounts,
  useNavBadges: () => ({ counts: { awaitingClaim: 0, overdue: 0, poolAwaiting: 0, bugNew: 0, bugUnread: 0 }, pollResult: "ok" }),
}));
// Real composer interactions are exercised; only raster work needs a browser canvas.
vi.mock("@/src/lib/bugs/prepare-image", () => ({ prepareImage: vi.fn(), exportAnnotatedImage: vi.fn() }));

const bugId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const imageId = "33333333-3333-4333-8333-333333333333";
const image: BugImageMeta = { id: imageId, kind: "comment", mimeType: "image/png", width: 1, height: 1, byteCount: 20, removed: false, url: `/api/bugs/images/${imageId}` };
function comment(index: number, overrides: Partial<BugComment> = {}): BugComment {
  return { id: `comment-${index}`, authorUserId: userId, isMine: true, body: `Comment ${index}`, createdAt: new Date(Date.UTC(2026, 9, 26, 0, index)).toISOString(), image: null, ...overrides };
}
function latestWindow(start = 51) { return Array.from({ length: 50 }, (_, index) => comment(start + index)); }
function thread(initial: BugComment[], commentsBefore: string | null = null) {
  return <BugCommentThread bugId={bugId} scope="mine" initial={initial} commentsBefore={commentsBefore} />;
}
function draftForm() { return screen.getByLabelText("Comment").closest("form")!; }
async function attachImage() {
  fireEvent.change(screen.getByLabelText("Choose comment image"), { target: { files: [new File(["source"], "comment.png", { type: "image/png" })] } });
  await screen.findByRole("img", { name: "Attached image preview" });
}

function page(comments: BugComment[], commentsBefore: string | null = null) {
  return { ok: true as const, data: { comments, commentsBefore, statusChanges: [], historyBefore: null } };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(addBugCommentAction).mockResolvedValue({ ok: false, code: "internal_error", reasonCode: null, correlationId: "test" });
  vi.mocked(prepareImage).mockResolvedValue(document.createElement("canvas"));
  vi.mocked(exportAnnotatedImage).mockImplementation(async () => new Blob(["prepared"], { type: "image/png" }));
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:comment-preview"), revokeObjectURL: vi.fn() });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("explains the comment rate limit and preserves the unsent comment and image", async () => {
  vi.mocked(addBugCommentAction).mockResolvedValue({ ok: false, code: "rule", reasonCode: "bug_rate_limited", correlationId: "test" });
  render(thread([]));
  await userEvent.type(screen.getByLabelText("Comment"), "Keep my comment draft");
  await attachImage();
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ส่งข้อความถี่เกินไป กรุณารอสักครู่แล้วลองอีกครั้ง");
  expect(screen.getByLabelText("Comment")).toHaveValue("Keep my comment draft");
  expect(screen.getByRole("button", { name: "Remove attachment" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});

it("explains the rolling image quota and preserves the unsent comment and image", async () => {
  vi.mocked(addBugCommentAction).mockResolvedValue({ ok: false, code: "rule", reasonCode: "bug_image_quota_exceeded", correlationId: "test" });
  render(thread([]));
  await userEvent.type(screen.getByLabelText("Comment"), "Keep my attachment draft");
  await attachImage();
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/^ใช้โควตาแนบไฟล์ครบ 50 MiB ใน 24 ชั่วโมงแล้ว$/);
  expect(screen.getByLabelText("Comment")).toHaveValue("Keep my attachment draft");
  expect(screen.getByRole("button", { name: "Remove attachment" })).toBeInTheDocument();
});

it("resumes real AutoRefresh after a submitted native edit is cleared successfully", async () => {
  vi.useFakeTimers();
  vi.mocked(addBugCommentAction).mockResolvedValue({ ok: true, data: { comment: comment(101, { body: "Submitted draft" }), activitySeq: 1 } });
  render(<><AutoRefresh />{thread([])}</>);
  fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "Submitted draft" } });
  fireEvent.blur(screen.getByLabelText("Comment"));
  await act(async () => { vi.advanceTimersByTime(45_000); });
  expect(router.refresh).not.toHaveBeenCalled();
  await act(async () => { fireEvent.submit(draftForm()); });
  expect(screen.getByLabelText("Comment")).toHaveValue("");
  await act(async () => { vi.advanceTimersByTime(45_000); });
  expect(router.refresh).toHaveBeenCalledTimes(1);
});

it("keeps real AutoRefresh held for an uncertain attempt and a separate unsent replay draft", async () => {
  vi.useFakeTimers();
  render(<><AutoRefresh />{thread([])}</>);
  fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "Uncertain original" } });
  await act(async () => { fireEvent.submit(draftForm()); });
  fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "" } });
  fireEvent.blur(screen.getByLabelText("Comment"));
  await act(async () => { vi.advanceTimersByTime(45_000); });
  expect(router.refresh).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "Separate draft" } });
  vi.mocked(addBugCommentAction).mockResolvedValueOnce({ ok: true, data: { comment: comment(101, { body: "Uncertain original" }), activitySeq: 1 } });
  await act(async () => { fireEvent.submit(draftForm()); });
  expect(screen.getByLabelText("Comment")).toHaveValue("Separate draft");
  await act(async () => { vi.advanceTimersByTime(45_000); });
  expect(router.refresh).not.toHaveBeenCalled();

  vi.mocked(addBugCommentAction).mockResolvedValueOnce({ ok: true, data: { comment: comment(102, { body: "Separate draft" }), activitySeq: 1 } });
  await act(async () => { fireEvent.submit(draftForm()); });
  await act(async () => { vi.advanceTimersByTime(45_000); });
  expect(router.refresh).toHaveBeenCalledTimes(1);
});

it("manages its refresh hold through the successful send lifecycle", async () => {
  let finish!: (value: Awaited<ReturnType<typeof addBugCommentAction>>) => void;
  vi.mocked(addBugCommentAction).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  render(thread([]));
  expect(draftForm()).toHaveAttribute("data-refresh-managed");
  expect(draftForm()).not.toHaveAttribute("data-refresh-hold");
  await userEvent.type(screen.getByLabelText("Comment"), "Ready to send");
  expect(draftForm()).toHaveAttribute("data-refresh-hold");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  expect(draftForm()).toHaveAttribute("data-refresh-hold");
  await act(async () => finish({ ok: true, data: { comment: comment(101, { body: "Ready to send" }), activitySeq: 1 } }));
  expect(screen.getByLabelText("Comment")).toHaveValue("");
  expect(screen.getByText("Ready to send")).toBeInTheDocument();
  expect(draftForm()).not.toHaveAttribute("data-refresh-hold");
});

it("holds an uncertain submission after clearing visible inputs and preserves a separate replay draft", async () => {
  render(thread([]));
  await userEvent.type(screen.getByLabelText("Comment"), "Original payload");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByRole("alert");
  const originalRequest = vi.mocked(addBugCommentAction).mock.calls[0][0] as FormData;
  await userEvent.clear(screen.getByLabelText("Comment"));
  expect(draftForm()).toHaveAttribute("data-refresh-hold");
  await userEvent.type(screen.getByLabelText("Comment"), "Separate unsent draft");
  vi.mocked(addBugCommentAction).mockResolvedValue({ ok: true, data: { comment: comment(101, { body: "Original payload" }), activitySeq: 1 } });
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Original payload");
  const replay = vi.mocked(addBugCommentAction).mock.calls[1][0] as FormData;
  expect(replay.get("requestId")).toBe(originalRequest.get("requestId"));
  expect(replay.get("body")).toBe("Original payload");
  expect(screen.getByLabelText("Comment")).toHaveValue("Separate unsent draft");
  expect(draftForm()).toHaveAttribute("data-refresh-hold");
});

it("holds refresh while an image draft is attached and releases when it is removed", async () => {
  render(thread([]));
  await attachImage();
  expect(draftForm()).toHaveAttribute("data-refresh-hold");
  await userEvent.click(screen.getByRole("button", { name: "Remove attachment" }));
  expect(draftForm()).not.toHaveAttribute("data-refresh-hold");
  expect(screen.queryByRole("img", { name: "Attached image preview" })).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:comment-preview");
});

it("holds refresh and disables sending while an image is being prepared, then retains the prepared draft", async () => {
  let finish!: (canvas: HTMLCanvasElement) => void;
  vi.mocked(prepareImage).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  render(thread([]));
  fireEvent.change(screen.getByLabelText("Choose comment image"), { target: { files: [new File(["source"], "comment.png", { type: "image/png" })] } });
  expect(draftForm()).toHaveAttribute("data-refresh-hold");
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await act(async () => finish(document.createElement("canvas")));
  expect(screen.getByRole("img", { name: "Attached image preview" })).toBeInTheDocument();
  expect(draftForm()).toHaveAttribute("data-refresh-hold");
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
});

it("preserves the existing image draft when a replacement fails preparation without opening annotation", async () => {
  render(thread([]));
  await attachImage();
  vi.mocked(prepareImage).mockRejectedValueOnce(new Error("เปิดรูปไม่ได้ กรุณาเลือกรูปใหม่"));
  fireEvent.change(screen.getByLabelText("Choose comment image"), { target: { files: [new File(["bad"], "bad.png", { type: "image/png" })] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("เปิดรูปไม่ได้ กรุณาเลือกรูปใหม่");
  expect(screen.getByRole("img", { name: "Attached image preview" })).toBeInTheDocument();
  expect(draftForm()).toHaveAttribute("data-refresh-hold");
  expect(screen.queryByRole("button", { name: "Annotate" })).not.toBeInTheDocument();
});

it("invalidates loaded comments outside the latest 50 on refresh and reloads scrubbed text and image tombstones", async () => {
  const older = Array.from({ length: 50 }, (_, index) => comment(index + 1));
  older[0] = comment(1, { body: "Private older body", image });
  vi.mocked(loadBugThreadAction).mockResolvedValueOnce(page(older, "before-1"));
  const { rerender } = render(thread(latestWindow(), "before-51"));
  await userEvent.click(screen.getByRole("button", { name: "Load older comments" }));
  await screen.findByText("Private older body");
  expect(screen.getByRole("img", { name: "Comment attachment" })).toHaveAttribute("src", image.url);
  await userEvent.type(screen.getByLabelText("Comment"), "Keep my draft");

  // The refreshed latest window and cursor can be unchanged while older rows
  // have been scrubbed by privacy handling or their images removed elsewhere.
  rerender(thread(latestWindow(), "before-51"));
  expect(screen.queryByText("Private older body")).not.toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Comment attachment" })).not.toBeInTheDocument();
  expect(within(screen.getByRole("list", { name: "Comments" })).getAllByRole("listitem")).toHaveLength(50);
  expect(screen.getByLabelText("Comment")).toHaveValue("Keep my draft");

  vi.mocked(loadBugThreadAction).mockResolvedValueOnce(page([comment(1, { body: "Scrubbed older body", image: { ...image, removed: true, url: null } })]));
  await userEvent.click(screen.getByRole("button", { name: "Load older comments" }));
  await screen.findByText("Scrubbed older body");
  expect(loadBugThreadAction).toHaveBeenLastCalledWith({ bugId, scope: "mine", commentsBefore: "before-51" });
  expect(screen.getByText("Image removed")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Load older comments" })).not.toBeInTheDocument();
});

it("invalidates a locally sent copy after it falls outside the refreshed latest 50", async () => {
  const sent = comment(51, { body: "Private locally sent body", image });
  vi.mocked(addBugCommentAction).mockResolvedValue({ ok: true, data: { comment: sent, activitySeq: 1 } });
  const { rerender } = render(thread(latestWindow(1)));
  await userEvent.type(screen.getByLabelText("Comment"), "Private locally sent body");
  await attachImage();
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  // The controlled textarea also exposes its draft as textContent. Only a row
  // in Comments proves the send completed; wait for its pending hold to release.
  await within(screen.getByRole("list", { name: "Comments" })).findByText("Private locally sent body");
  await waitFor(() => expect(screen.getByLabelText("Comment")).toBeEnabled());
  await userEvent.type(screen.getByLabelText("Comment"), "Still unsent");
  expect(screen.getByLabelText("Comment")).toHaveValue("Still unsent");

  rerender(thread(latestWindow(52), "before-52"));
  expect(screen.queryByText("Private locally sent body")).not.toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Comment attachment" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Comment")).toHaveValue("Still unsent");
  vi.mocked(loadBugThreadAction).mockResolvedValueOnce(page([{ ...sent, body: "Scrubbed sent body", image: { ...image, removed: true, url: null } }]));
  await userEvent.click(screen.getByRole("button", { name: "Load older comments" }));
  await screen.findByText("Scrubbed sent body");
  expect(screen.getByText("Image removed")).toBeInTheDocument();
});

it("ignores an old in-flight page after refresh without blocking fresh pagination or restoring its cursor", async () => {
  let finishOld!: (value: Awaited<ReturnType<typeof loadBugThreadAction>>) => void;
  vi.mocked(loadBugThreadAction).mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; }));
  const { rerender } = render(thread(latestWindow(), "before-51"));
  await userEvent.click(screen.getByRole("button", { name: "Load older comments" }));
  rerender(thread(latestWindow(), "before-51"));
  expect(screen.getByRole("button", { name: "Load older comments" })).toBeEnabled();
  vi.mocked(loadBugThreadAction).mockResolvedValueOnce(page([comment(1, { body: "Fresh scrubbed page" })]));
  await userEvent.click(screen.getByRole("button", { name: "Load older comments" }));
  await screen.findByText("Fresh scrubbed page");
  await act(async () => finishOld(page([comment(1, { body: "Stale private page", image })], "stale-cursor")));
  expect(screen.queryByText("Stale private page")).not.toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Comment attachment" })).not.toBeInTheDocument();
  expect(screen.getByText("Fresh scrubbed page")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Load older comments" })).not.toBeInTheDocument();
});

it("does not reintroduce a stale local send response after an authoritative refresh", async () => {
  let finish!: (value: Awaited<ReturnType<typeof addBugCommentAction>>) => void;
  vi.mocked(addBugCommentAction).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const { rerender } = render(thread(latestWindow(1)));
  fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "Pending private body" } });
  fireEvent.submit(draftForm());
  await waitFor(() => expect(addBugCommentAction).toHaveBeenCalledTimes(1));
  rerender(thread(latestWindow(52), "before-52"));
  await act(async () => finish({ ok: true, data: { comment: comment(51, { body: "Pending private body", image }), activitySeq: 1 } }));
  expect(screen.queryByText("Pending private body")).not.toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Comment attachment" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Comment")).toHaveValue("");
});


it("renders initials and opposite-side bubbles, with comment images linking to the full private image", () => {
  render(<BugCommentThread bugId={bugId} scope="triage" initial={[
    comment(1, { body: "Own reply", image }),
    comment(2, { body: "Other reply", isMine: false, authorUserId: "other" }),
  ]} commentsBefore={null} staff={[{ id: userId, displayName: "Alex Example", nickname: null }, { id: "other", displayName: "Sam Example", nickname: null }]} />);
  expect(screen.getByRole("img", { name: "Alex Example" })).toHaveTextContent("AE");
  expect(screen.getByRole("img", { name: "Sam Example" })).toHaveTextContent("SE");
  expect(screen.getByText("Own reply").closest("li")).toHaveClass("bugs-comment--own");
  expect(screen.getByText("Other reply").closest("li")).not.toHaveClass("bugs-comment--own");
  const attachment = screen.getByRole("img", { name: "Comment attachment" });
  expect(attachment.closest("a")).toHaveAttribute("href", image.url);
  expect(attachment.closest("a")).toHaveAttribute("target", "_blank");
  expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
});

it("pastes images anywhere in the composer without annotating, and sends attachment-only with an empty body for server NULL", async () => {
  vi.mocked(addBugCommentAction).mockResolvedValueOnce({ ok: true, data: { comment: comment(101, { body: null, image }), activitySeq: 1 } });
  render(thread([]));
  const file = new File(["pasted"], "paste.png", { type: "image/png" });
  fireEvent.paste(screen.getByRole("button", { name: "Attach image or PDF" }), { clipboardData: { items: [{ kind: "file", type: file.type, getAsFile: () => file }] } });
  await screen.findByRole("img", { name: "Attached image preview" });
  expect(screen.getByPlaceholderText("พิมพ์ข้อความ… (วางรูปหรือไฟล์ PDF ด้วย ⌘/Ctrl+V ได้)")).toHaveAttribute("rows", "2");
  expect(screen.queryByRole("button", { name: "Annotate" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("(Image)");
  const submitted = vi.mocked(addBugCommentAction).mock.calls[0][0] as FormData;
  expect(submitted.get("body")).toBe("");
  expect(submitted.get("image")).toBeInstanceOf(Blob);
  expect(screen.queryByRole("img", { name: "Attached image preview" })).not.toBeInTheDocument();
});

it("lets ordinary text paste through and never turns it into an attachment", () => {
  render(thread([]));
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { items: [{ kind: "string", type: "text/plain", getAsFile: () => null }] } });
  fireEvent(screen.getByLabelText("Comment"), event);
  expect(event.defaultPrevented).toBe(false);
  expect(prepareImage).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
});

it("keeps removal restricted to triage and requires a reason before replacing an image with its tombstone", async () => {
  const { rerender } = render(thread([comment(1, { image })]));
  expect(screen.queryByRole("button", { name: "Remove image" })).not.toBeInTheDocument();
  rerender(<BugCommentThread bugId={bugId} scope="triage" initial={[comment(1, { image })]} commentsBefore={null} />);
  vi.mocked(removeBugImageAction).mockResolvedValueOnce({ ok: true, data: { ...image, removed: true, url: null } });
  await userEvent.click(screen.getByRole("button", { name: "Remove image" }));
  expect(screen.getByRole("button", { name: "Confirm removal" })).toBeDisabled();
  await userEvent.type(screen.getByLabelText("Removal reason"), "Private customer details");
  await userEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
  expect(await screen.findByText("Image removed")).toBeInTheDocument();
  expect(removeBugImageAction).toHaveBeenCalledWith({ imageId, reason: "Private customer details" });
  expect(screen.queryByRole("img", { name: "Comment attachment" })).not.toBeInTheDocument();
});


it("keeps an own-message image tombstone transparent so its inherited white text stays visible", () => {
  const style = document.createElement("style");
  // JSDOM does not resolve custom properties; feed the real styles resolved
  // against the actual token values so an inherited on-ink/canvas clash fails.
  const tokens = new Map([...readFileSync("tokens/bug-tokens.css", "utf8").matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]));
  style.textContent = (readFileSync("src/components/bugs/bug-images.css", "utf8") + readFileSync("src/components/bugs/bug-comment-thread.css", "utf8"))
    .replace(/var\((--[a-z0-9-]+)\)/g, (expression, name: string) => tokens.get(name) ?? expression);
  document.head.append(style);
  try {
    render(thread([comment(1, { image: { ...image, removed: true, url: null } })]));
    expect(getComputedStyle(screen.getByText("Image removed")).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  } finally { style.remove(); }
});

it("rejects an oversized PDF paste and preserves both text and an attached image draft", async () => {
  render(thread([]));
  await userEvent.type(screen.getByLabelText("Comment"), "Keep text and image");
  await attachImage();
  const pdf = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "evidence.pdf", { type: "application/pdf" });
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { items: [{ kind: "file", type: "application/pdf", getAsFile: () => pdf }] } });
  fireEvent(screen.getByLabelText("Comment"), event);
  expect(await screen.findByRole("alert")).toHaveTextContent("4 MiB");
  expect(event.defaultPrevented).toBe(true);
  expect(screen.getByLabelText("Comment")).toHaveValue("Keep text and image");
  expect(screen.getByRole("img", { name: "Attached image preview" })).toBeInTheDocument();
  expect(prepareImage).toHaveBeenCalledTimes(1);
});


it("creates a NULL-body PDF-only comment then uploads separately and retries without another comment", async () => {
  const pending = comment(101, { body: null, pendingPdf: true });
  const pdfId = "44444444-4444-4444-8444-444444444444";
  const pdf = { id: pdfId, kind: "comment_pdf" as const, mimeType: "application/pdf" as const, fileName: "evidence.pdf", byteCount: 8, removed: false, url: `/api/bugs/files/${pdfId}` };
  vi.mocked(addBugCommentAction).mockResolvedValueOnce({ ok: true, data: { comment: pending, activitySeq: 1 } });
  vi.mocked(attachBugPdfAction).mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce({ ok: true, data: pdf });
  render(thread([]));
  const file = new File(["%PDF-1.7"], "evidence.pdf", { type: "application/pdf" });
  fireEvent.paste(screen.getByRole("button", { name: "Attach image or PDF" }), { clipboardData: { items: [{ kind: "file", type: file.type, getAsFile: () => file }] } });
  expect(screen.getByText("evidence.pdf")).toBeInTheDocument();
  expect(draftForm()).toHaveAttribute("data-refresh-hold");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("แนบ PDF ไม่สำเร็จ");
  const created = vi.mocked(addBugCommentAction).mock.calls[0][0] as FormData;
  expect(created.get("body")).toBe("");
  expect(created.get("pendingPdf")).toBe("true");
  expect(created.get("pdf")).toBeNull();
  const first = vi.mocked(attachBugPdfAction).mock.calls[0][0] as FormData;
  expect(first.get("commentId")).toBe(pending.id);
  expect(first.get("pdf")).toBe(file);
  await userEvent.click(screen.getByRole("button", { name: "Retry PDF upload" }));
  expect(await screen.findByRole("link", { name: /ไฟล์ PDF/ })).toHaveAttribute("href", pdf.url);
  const replay = vi.mocked(attachBugPdfAction).mock.calls[1][0] as FormData;
  expect(replay.get("requestId")).toBe(first.get("requestId"));
  expect(replay.get("pdf")).toBe(file);
  expect(addBugCommentAction).toHaveBeenCalledTimes(1);
  expect(prepareImage).not.toHaveBeenCalled();
});

it("explains a known PDF refusal on the saved comment and allows file correction", async () => {
  vi.mocked(addBugCommentAction).mockResolvedValueOnce({ ok: true, data: { comment: comment(101, { body: null, pendingPdf: true }), activitySeq: 1 } });
  vi.mocked(attachBugPdfAction).mockResolvedValueOnce({ ok: false, code: "invalid_input", reasonCode: null, correlationId: "test" });
  render(thread([]));
  fireEvent.change(screen.getByLabelText("Choose comment image"), { target: { files: [new File(["%PDF-/JavaScript"], "rejected.pdf", { type: "application/pdf" })] } });
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("แนบ PDF ไม่สำเร็จ");
  expect(screen.getByText("(PDF)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Attach PDF" })).toBeEnabled();
  expect(screen.queryByText(/rejected.pdf/)).not.toBeInTheDocument();
  expect(addBugCommentAction).toHaveBeenCalledTimes(1);
});

it("renders one-line PDF comment cards with inherited own-message colour and no filename line", () => {
  const pdfId = "44444444-4444-4444-8444-444444444444";
  const pdf = { id: pdfId, kind: "comment_pdf" as const, mimeType: "application/pdf" as const, fileName: "private-filename.pdf", byteCount: 8, removed: false, url: `/api/bugs/files/${pdfId}` };
  render(thread([comment(1, { body: null, pdf }), comment(2, { isMine: false, body: "Team file", pdf: { ...pdf, id: imageId, url: `/api/bugs/files/${imageId}` } })]));
  const cards = screen.getAllByRole("link", { name: /ไฟล์ PDF/ });
  expect(cards[0]).toHaveClass("bugs-pdf__download--comment", "bugs-pdf__download--own");
  expect(cards[1]).toHaveClass("bugs-pdf__download--comment");
  expect(cards[1]).not.toHaveClass("bugs-pdf__download--own");
  expect(cards[0]).toHaveTextContent(/^ไฟล์ PDF — กดเพื่อดาวน์โหลด$/);
  expect(screen.queryByText("private-filename.pdf")).not.toBeInTheDocument();
  expect(cards[0]).toHaveAttribute("download", "private-filename.pdf");
});

it("explains another author's pending PDF without offering their upload controls", () => {
  render(thread([comment(1, { body: null, pendingPdf: true, isMine: false })]));
  expect(screen.getByText("ผู้ส่งยังแนบ PDF ไม่สำเร็จ")).toHaveClass("bugs-helper");
  expect(screen.queryByRole("button", { name: "Attach PDF" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Choose PDF attachment")).not.toBeInTheDocument();
});

it("keeps helper text legible inside the author's own bubble", () => {
  const style = document.createElement("style");
  const tokens = new Map([...readFileSync("tokens/bug-tokens.css", "utf8").matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]));
  style.textContent = (".bugs-helper { color: #6b6b74; }" + readFileSync("src/components/bugs/bug-pdf.css", "utf8") + readFileSync("src/components/bugs/bug-comment-thread.css", "utf8"))
    .replace(/var\((--[a-z0-9-]+)\)/g, (expression, name: string) => tokens.get(name) ?? expression);
  document.head.append(style);
  try {
    render(thread([comment(1, { image: { ...image, url: "https://outside.invalid/private-image" } })]));
    const helper = screen.getByText("ไม่สามารถแสดงรูปนี้ได้");
    expect(getComputedStyle(helper).color).toBe("rgb(255, 255, 255)");
    expect(getComputedStyle(helper).opacity).toBe("0.8");
  } finally { style.remove(); }
});

it("gives a failed PDF alert in an own bubble a token-based surface with readable negative text", () => {
  const css = readFileSync("src/components/bugs/bug-pages.css", "utf8");
  const tokens = new Map([...readFileSync("tokens/bug-tokens.css", "utf8").matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]));
  const style = document.createElement("style");
  style.textContent = (css + readFileSync("src/components/bugs/bug-pdf.css", "utf8") + readFileSync("src/components/bugs/bug-comment-thread.css", "utf8"))
    .replace(/var\((--[a-z0-9-]+)\)/g, (expression, name: string) => tokens.get(name) ?? expression);
  document.head.append(style);
  try {
    render(thread([comment(1, { body: null, pendingPdf: true })]));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("bugs-pdf__error");
    expect(alert.closest("li")).toHaveClass("bugs-comment--own");
    const computed = getComputedStyle(alert);
    expect(computed.backgroundColor).toBe("rgb(253, 241, 241)");
    expect(computed.color).toBe("rgb(142, 38, 38)");
    expect(computed.fontSize).toBe("12px");
    const luminance = (color: string) => {
      const channels = color.match(/\d+/g)!.slice(0, 3).map((channel) => {
        const value = Number(channel) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    expect((luminance(computed.backgroundColor) + 0.05) / (luminance(computed.color) + 0.05)).toBeGreaterThanOrEqual(4.5);
    const rule = css.match(/\.bugs-comment--own \.bugs-comment__bubble \[role="alert"\]\s*\{([^}]+)\}/)?.[1];
    expect(rule).toMatch(/background:\s*var\(--negative-surface\)/);
    expect(rule).toMatch(/padding:\s*calc\(var\(--shell-edge-gap\) \/ 2\) var\(--shell-edge-gap\)/);
    expect(rule).toMatch(/border-radius:\s*var\(--radius-control\)/);
  } finally { style.remove(); }
});

it("explains uncertain delivery and preserves an identical retry payload with the selected image", async () => {
  vi.mocked(addBugCommentAction).mockRejectedValueOnce(new Error("response lost"));
  render(thread([]));
  fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "Retained draft" } });
  await attachImage();
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/^ยังไม่แน่ใจว่าส่งสำเร็จหรือไม่ ข้อความและรูปยังอยู่ กดส่งอีกครั้งได้เลย$/);
  expect(screen.getByLabelText("Comment")).toHaveValue("Retained draft");
  expect(screen.getByRole("img", { name: "Attached image preview" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  const forms = vi.mocked(addBugCommentAction).mock.calls.map(([form]) => form as FormData);
  expect(forms[1].get("requestId")).toBe(forms[0].get("requestId"));
  expect(forms[1].get("body")).toBe(forms[0].get("body"));
  expect(forms[1].get("image")).toBeInstanceOf(Blob);
});

it("keeps the image and PDF remove dots compact inside transparent 44px phone targets", async () => {
  const tokens = new Map([...readFileSync("tokens/bug-tokens.css", "utf8").matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]));
  const style = document.createElement("style");
  style.textContent = (readFileSync("src/components/bugs/bug-comment-thread.css", "utf8") + readFileSync("src/components/bugs/bug-pdf.css", "utf8"))
    .replace(/var\((--[a-z0-9-]+)\)/g, (expression, name: string) => tokens.get(name) ?? expression);
  document.head.append(style);
  const phoneStyle = document.createElement("style");
  phoneStyle.textContent = Array.from(style.sheet!.cssRules)
    .filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule && rule.conditionText === "(max-width: 767px)")
    .flatMap((rule) => Array.from(rule.cssRules, (phoneRule) => phoneRule.cssText)).join("\n");
  document.head.append(phoneStyle);
  try {
    render(thread([]));
    await attachImage();
    function checkTarget() {
      const target = screen.getByRole("button", { name: "Remove attachment" });
      const dot = target.firstElementChild!;
      expect(getComputedStyle(target).width).toBe("44px");
      expect(getComputedStyle(target).height).toBe("44px");
      expect(getComputedStyle(target).backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(getComputedStyle(dot).width).toBe("20px");
      expect(getComputedStyle(dot).height).toBe("20px");
      expect(getComputedStyle(dot).backgroundColor).toBe("rgb(220, 38, 38)");
    }
    checkTarget();
    await userEvent.click(screen.getByRole("button", { name: "Remove attachment" }));
    fireEvent.change(screen.getByLabelText("Choose comment image"), { target: { files: [new File(["%PDF-1.7"], "evidence.pdf", { type: "application/pdf" })] } });
    checkTarget();
  } finally { style.remove(); phoneStyle.remove(); }
});
