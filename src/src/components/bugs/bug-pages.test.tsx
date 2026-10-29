import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { BugDetail } from "./bug-detail";
import { BugList } from "./bug-list";
import { BugStatusHistory } from "./bug-status-history";
import { BugsWorkspace } from "./bugs-workspace";
import { ReporterReadEffect } from "./reporter-read-effect";
import { AutoRefresh } from "@/src/components/shell/auto-refresh";
import { addBugCommentAction, loadBugThreadAction, markBugReadAction, removeBugImageAction, updateBugAction } from "@/app/actions/bugs";
import type { BugDetail as Detail } from "@/src/lib/bugs/types";

const { refreshCounts, router } = vi.hoisted(() => ({ refreshCounts: vi.fn(), router: { refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/src/components/shell/nav-badges", () => ({ useRefreshNavCounts: () => refreshCounts, useNavBadges: () => ({ pollResult: "success" }) }));
vi.mock("@/app/actions/bugs", () => ({ addBugCommentAction: vi.fn(), loadBugThreadAction: vi.fn(), markBugReadAction: vi.fn(), removeBugImageAction: vi.fn(), updateBugAction: vi.fn(), attachBugPdfAction: vi.fn(), removeBugPdfAction: vi.fn() }));
vi.mock("@/src/lib/bugs/prepare-image", () => ({ prepareImage: vi.fn(async () => ({ width: 1, height: 1 })), exportAnnotatedImage: vi.fn(async () => new Blob(["image"], { type: "image/png" })) }));
vi.mock("./bug-image-viewer", () => ({ BugImageViewer: ({ image }: { image: { removed: boolean } }) => <span>{image.removed ? "Image removed" : "Screenshot"}</span> }));
const id = "11111111-1111-4111-8111-111111111111";
const imageId = "22222222-2222-4222-8222-222222222222";
const image = { id: imageId, kind: "comment" as const, mimeType: "image/png", width: 1, height: 1, byteCount: 20, removed: false, url: `/api/bugs/images/${imageId}` };
const detail = (): Detail => ({ id, summary: "<script>private</script>", description: "<b>description</b>", status: "new", priority: null, assigned: false, assignedToUserId: null, version: 1, reporterActivitySeq: 4, reporterReadSeq: 2, unread: true, isOwner: true, createdAt: "2026-10-26T03:00:00Z", updatedAt: "2026-10-26T03:00:00Z", pagePath: "/today", pageQuery: "", viewportWidth: 800, viewportHeight: 600, osName: "macOS", osVersion: null, browserName: "Safari", browserVersion: null, deviceType: "desktop", appBuildSha: null, screenshot: null, comments: [{ id: "c2", isMine: false, body: "<img src=x onerror=alert(1)>", createdAt: "2026-10-26T04:00:00Z", image }], statusChanges: [{ id: "h2", isMine: false, fromStatus: null, toStatus: "new", reason: null, createdAt: "2026-10-26T03:00:00Z" }], commentsBefore: "older", historyBefore: "history", seenActivitySeq: 4 });
beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:comment-preview");
  URL.revokeObjectURL = vi.fn();
  vi.mocked(updateBugAction).mockReset();
  vi.mocked(markBugReadAction).mockResolvedValue({ ok: true, data: { readSeq: 4, activitySeq: 5 } });
  vi.mocked(addBugCommentAction).mockResolvedValue({ ok: false, code: "internal_error", reasonCode: null, correlationId: "test" });
  vi.mocked(updateBugAction).mockResolvedValue({ ok: false, code: "stale_state", reasonCode: "stale_state", currentVersion: 2, correlationId: "test" });
});

it("accepts a corrected comment after a definite validation refusal", async () => {
  vi.mocked(addBugCommentAction).mockResolvedValueOnce({ ok: false, code: "invalid_input", reasonCode: null, correlationId: "test" });
  render(<BugDetail detail={detail()} scope="mine" triagers={[]} />);
  await userEvent.type(screen.getByLabelText("Comment"), "Rejected input");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByRole("alert");
  const first = vi.mocked(addBugCommentAction).mock.calls[0][0] as FormData;
  await userEvent.clear(screen.getByLabelText("Comment"));
  await userEvent.type(screen.getByLabelText("Comment"), "Corrected input");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  const corrected = vi.mocked(addBugCommentAction).mock.calls[1][0] as FormData;
  expect(corrected.get("body")).toBe("Corrected input");
  expect(corrected.get("requestId")).not.toBe(first.get("requestId"));
});
it("renders escaped text, immutable comments, unread state and nested real detail links", () => {
  const report = detail();
  render(<><BugList items={[report]} scope="mine" selectedId={id} filters={{}} nextCursor={null} /><BugDetail detail={report} scope="mine" triagers={[]} /></>);
  expect(screen.getByRole("link", { name: /private/ })).toHaveAttribute("href", `/bugs/mine/${id}`);
  expect(screen.getByText("Unread")).toBeInTheDocument();
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  expect(document.querySelector("script, img[onerror]")).toBeNull();
  expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
});
it("labels own and team activity from Mine projections without user identities", () => {
  const report = detail();
  report.comments = [
    { id: "own-comment", isMine: true, body: "My own comment", createdAt: report.createdAt, image: null },
    { id: "team-comment", isMine: false, body: "A team reply", createdAt: report.createdAt, image: null },
  ];
  report.statusChanges = [
    { id: "own-change", isMine: true, fromStatus: null, toStatus: "new", reason: null, createdAt: report.createdAt },
    { id: "team-change", isMine: false, fromStatus: "new", toStatus: "in_progress", reason: null, createdAt: report.createdAt },
  ];
  render(<><BugDetail detail={report} scope="mine" triagers={[]} /><BugStatusHistory bugId={report.id} scope="mine" initial={report.statusChanges} historyBefore={report.historyBefore} /></>);
  const comments = within(screen.getByRole("list", { name: "Comments" })).getAllByRole("listitem");
  expect(comments[0]).toHaveClass("bugs-comment--own");
  expect(comments[0]).toHaveTextContent("You ·");
  expect(comments[1]).not.toHaveClass("bugs-comment--own");
  expect(comments[1]).toHaveTextContent("Team member ·");
  const history = within(screen.getByRole("region", { name: "Status history" })).getAllByRole("listitem");
  expect(history[0]).toHaveTextContent("You ·");
  expect(history[1]).toHaveTextContent("Team member ·");
});
it("retains staff labels for comment and status identities in triage projections", () => {
  const report = detail();
  report.comments = [{ ...report.comments[0], authorUserId: "triager", isMine: false }];
  report.statusChanges = [{ ...report.statusChanges[0], changedByUserId: "triager", isMine: false }];
  render(<BugDetail detail={report} scope="triage" triagers={[{ id: "triager", displayName: "Triage name", nickname: "Triage nickname" }]} />);
  expect(screen.getByRole("list", { name: "Comments" })).toHaveTextContent("Triage nickname ·");
  expect(screen.getByRole("region", { name: "Status history" })).toHaveTextContent("Triage nickname ·");
});
it("sends one atomic text/image comment and keeps draft plus retry key after uncertain failure and revalidation", async () => {
  const report = detail(); const { rerender } = render(<BugDetail detail={report} scope="mine" triagers={[]} />);
  await userEvent.type(screen.getByLabelText("Comment"), "draft reply");
  fireEvent.change(screen.getByLabelText("Choose comment image"), { target: { files: [new File(["image"], "comment.png", { type: "image/png" })] } });
  await screen.findByRole("img", { name: "Attached image preview" });
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByRole("alert");
  const first = vi.mocked(addBugCommentAction).mock.calls[0][0] as FormData;
  expect(first.get("body")).toBe("draft reply"); expect(first.get("image")).toBeInstanceOf(Blob);
  rerender(<BugDetail detail={{ ...report, version: 2 }} scope="mine" triagers={[]} />);
  expect(screen.getByLabelText("Comment")).toHaveValue("draft reply");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  const second = vi.mocked(addBugCommentAction).mock.calls[1][0] as FormData;
  expect(second.get("requestId")).toBe(first.get("requestId"));
});
it("handles cancellation reason, nullable fields and stale version without silently retrying", async () => {
  render(<BugDetail detail={detail()} scope="triage" triagers={[]} />);
  await userEvent.selectOptions(screen.getByLabelText("Status"), "cancelled");
  expect(screen.getByLabelText("Cancellation reason")).toBeRequired();
  await userEvent.type(screen.getByLabelText("Cancellation reason"), "duplicate");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(updateBugAction).toHaveBeenCalledWith({ bugId: id, expectedVersion: 1, patch: { status: "cancelled", priority: null }, reason: "duplicate" });
  expect(await screen.findByRole("alert")).toHaveTextContent("มีผู้แก้ไข");
  expect(screen.getByRole("link", { name: "Reload report" })).toHaveAttribute("href", `/bugs/${id}`);
  expect(updateBugAction).toHaveBeenCalledTimes(1);
});
it("adopts refreshed triage fields and uses their version for the next save when clean", async () => {
  const report = detail();
  const triagers = [{ id: "triager", displayName: "Triager", nickname: null }];
  const { rerender } = render(<BugDetail detail={report} scope="triage" triagers={triagers} />);
  rerender(<BugDetail detail={{ ...report, status: "in_progress", priority: "high", assignedToUserId: "triager", version: 2 }} scope="triage" triagers={triagers} />);
  expect(screen.getByLabelText("Status")).toHaveValue("in_progress");
  expect(screen.getByLabelText("Priority")).toHaveValue("high");
  expect(screen.getByLabelText("Assignee")).toHaveValue("triager");
  expect(screen.getByLabelText("Status").closest("form")).not.toHaveAttribute("data-refresh-hold");
  await userEvent.selectOptions(screen.getByLabelText("Status"), "done");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(updateBugAction).toHaveBeenCalledWith({ bugId: id, expectedVersion: 2, patch: { status: "done", priority: "high" } });
});
it("preserves dirty triage fields and cancellation reason across refresh until the original version conflicts", async () => {
  const report = { ...detail(), status: "in_progress" as const, priority: "low" as const, assignedToUserId: "first" };
  const triagers = [{ id: "first", displayName: "First triager", nickname: null }, { id: "second", displayName: "Second triager", nickname: null }];
  const { rerender } = render(<BugDetail detail={report} scope="triage" triagers={triagers} />);
  await userEvent.selectOptions(screen.getByLabelText("Status"), "cancelled");
  await userEvent.selectOptions(screen.getByLabelText("Priority"), "high");
  await userEvent.selectOptions(screen.getByLabelText("Assignee"), "second");
  await userEvent.type(screen.getByLabelText("Cancellation reason"), "duplicate draft");
  rerender(<BugDetail detail={{ ...report, status: "done", priority: "critical", assignedToUserId: null, version: 2 }} scope="triage" triagers={triagers} />);
  expect(screen.getByLabelText("Status")).toHaveValue("cancelled");
  expect(screen.getByLabelText("Priority")).toHaveValue("high");
  expect(screen.getByLabelText("Assignee")).toHaveValue("second");
  expect(screen.getByLabelText("Cancellation reason")).toHaveValue("duplicate draft");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(updateBugAction).toHaveBeenCalledWith({ bugId: id, expectedVersion: 1, patch: { status: "cancelled", priority: "high", assignedToUserId: "second" }, reason: "duplicate draft" });
  expect(await screen.findByRole("alert")).toHaveTextContent("มีผู้แก้ไข");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "Reload report" })).toBeInTheDocument();
});
it.each([null, { id: "first", displayName: "First triager", nickname: null, available: true }])("keeps a selected assignee visible when refreshed availability removes them and the report assignee is %j", async (serverAssignee) => {
  const first = { id: "first", displayName: "First triager", nickname: null };
  const second = { id: "second", displayName: "Second triager", nickname: "Bee" };
  const report = { ...detail(), assignedToUserId: "first", assignee: { ...first, available: true } };
  vi.mocked(updateBugAction).mockResolvedValueOnce({ ok: false, code: "rule", reasonCode: "bug_assignee_unavailable", correlationId: "test" })
    .mockResolvedValueOnce({ ok: true, data: { id, version: 2, status: "new" } });
  const { rerender } = render(<BugDetail detail={report} scope="triage" triagers={[first, second]} />);
  await userEvent.selectOptions(screen.getByLabelText("Assignee"), "second");
  rerender(<BugDetail detail={{ ...report, assignee: serverAssignee }} scope="triage" triagers={[first]} />);
  expect(screen.getByLabelText("Assignee")).toHaveValue("second");
  expect(screen.getByRole("option", { name: "Bee (unavailable)" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(updateBugAction).toHaveBeenCalledWith({ bugId: id, expectedVersion: 1, patch: { status: "new", priority: null, assignedToUserId: "second" } });
  expect(await screen.findByRole("alert")).toHaveTextContent("ผู้รับผิดชอบไม่พร้อมรับงานแล้ว");
  expect(screen.getByLabelText("Assignee")).toHaveValue("second");
  await userEvent.selectOptions(screen.getByLabelText("Assignee"), "");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(updateBugAction).toHaveBeenLastCalledWith({ bugId: id, expectedVersion: 1, patch: { status: "new", priority: null, assignedToUserId: null } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("shows a selected unavailable assignee even when their staff metadata is missing", () => {
  render(<BugDetail detail={{ ...detail(), assignedToUserId: "unknown" }} scope="triage" triagers={[]} />);
  expect(screen.getByLabelText("Assignee")).toHaveValue("unknown");
  expect(screen.getByRole("option", { name: "Team member (unavailable)" })).toBeDisabled();
});
it("releases the managed triage refresh hold after a priority save before refreshed props arrive", async () => {
  vi.mocked(updateBugAction).mockResolvedValue({ ok: true, data: { id, version: 2, status: "new" } });
  const report = detail();
  const { rerender } = render(<BugDetail detail={report} scope="triage" triagers={[]} />);
  const form = screen.getByLabelText("Priority").closest("form")!;
  await userEvent.selectOptions(screen.getByLabelText("Priority"), "high");
  expect(form).toHaveAttribute("data-refresh-hold");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled());
  expect(form).not.toHaveAttribute("data-refresh-hold");
  expect(form).toHaveAttribute("data-refresh-managed");
  rerender(<BugDetail detail={{ ...report }} scope="triage" triagers={[]} />);
  expect(screen.getByLabelText("Priority")).toHaveValue("high");
  expect(form).not.toHaveAttribute("data-refresh-hold");
  rerender(<BugDetail detail={{ ...report, priority: "high", version: 2 }} scope="triage" triagers={[]} />);
  expect(form).not.toHaveAttribute("data-refresh-hold");
});
it("resumes the 45-second auto refresh after a successful priority save", async () => {
  const intervals = vi.spyOn(window, "setInterval");
  vi.mocked(updateBugAction).mockResolvedValue({ ok: true, data: { id, version: 2, status: "new" } });
  const view = render(<><AutoRefresh /><BugDetail detail={detail()} scope="triage" triagers={[]} /></>);
  try {
    const tick = intervals.mock.calls.find(([, delay]) => delay === 45_000)?.[0];
    if (typeof tick !== "function") throw new Error("AutoRefresh must register its 45-second timer");
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "high" } });
    await act(async () => { tick(); });
    expect(router.refresh).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save changes" })); });
    await act(async () => { tick(); });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount();
    intervals.mockRestore();
  }
});
it("holds a clean conflicting triage editor for explicit recovery", async () => {
  render(<BugDetail detail={detail()} scope="triage" triagers={[]} />);
  // A disabled clean Save button blocks UI submission; retain the handler's
  // conflict-recovery coverage for a direct/native form submission as well.
  fireEvent.submit(screen.getByLabelText("Status").closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("มีผู้แก้ไข");
  expect(screen.getByLabelText("Status").closest("form")).toHaveAttribute("data-refresh-hold");
});
it("keeps the pending triage payload stable and adopts a newer refresh after a no-op save completes", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof updateBugAction>>) => void;
  vi.mocked(updateBugAction).mockReturnValue(new Promise((done) => { resolve = done; }));
  const report = detail();
  const triagers = [{ id: "triager", displayName: "Triager", nickname: null }];
  const { rerender } = render(<BugDetail detail={report} scope="triage" triagers={triagers} />);
  fireEvent.submit(screen.getByLabelText("Status").closest("form")!);
  rerender(<BugDetail detail={{ ...report, status: "in_progress", priority: "critical", assignedToUserId: "triager", version: 2 }} scope="triage" triagers={triagers} />);
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(screen.getByLabelText("Status")).toHaveValue("new");
  expect(screen.getByLabelText("Priority")).toHaveValue("");
  expect(screen.getByLabelText("Assignee")).toHaveValue("");
  expect(updateBugAction).toHaveBeenCalledWith({ bugId: id, expectedVersion: 1, patch: { status: "new", priority: null } });
  await act(async () => resolve({ ok: true, data: { id, version: 1, status: "new" } }));
  expect(screen.getByLabelText("Status")).toHaveValue("in_progress");
  expect(screen.getByLabelText("Priority")).toHaveValue("critical");
  expect(screen.getByLabelText("Assignee")).toHaveValue("triager");
  expect(screen.getByLabelText("Status").closest("form")).not.toHaveAttribute("data-refresh-hold");
  vi.mocked(updateBugAction).mockResolvedValue({ ok: true, data: { id, version: 2, status: "in_progress" } });
  fireEvent.submit(screen.getByLabelText("Status").closest("form")!);
  expect(updateBugAction).toHaveBeenLastCalledWith({ bugId: id, expectedVersion: 2, patch: { status: "in_progress", priority: "critical" } });
});
it("loads older pages chronologically without acknowledging a newer watermark", async () => {
  const report = detail();
  vi.mocked(loadBugThreadAction).mockResolvedValue({ ok: true, data: { comments: [{ ...report.comments[0], id: "c1", body: "older comment", createdAt: "2026-10-25T04:00:00Z" }], statusChanges: [], commentsBefore: null, historyBefore: null } });
  render(<BugDetail detail={report} scope="mine" triagers={[]} />);
  await waitFor(() => expect(markBugReadAction).toHaveBeenCalledWith({ bugId: id, seenActivitySeq: 4 }));
  await userEvent.click(screen.getByRole("button", { name: "Load older comments" }));
  await screen.findByText("older comment");
  expect(loadBugThreadAction).toHaveBeenCalledWith({ bugId: id, scope: "mine", commentsBefore: "older" });
  expect(within(screen.getByRole("list", { name: "Comments" })).getAllByRole("listitem")[0]).toHaveTextContent("older comment");
  expect(markBugReadAction).toHaveBeenCalledTimes(1);
});
it("removes an image only through the triager reason dialog, retaining a tombstone", async () => {
  vi.mocked(removeBugImageAction).mockResolvedValue({ ok: true, data: { ...image, removed: true, url: null } });
  render(<BugDetail detail={detail()} scope="triage" triagers={[]} />);
  await userEvent.click(screen.getByRole("button", { name: "Remove image" }));
  const dialog = screen.getByRole("dialog", { name: "Remove image" });
  expect(within(dialog).getByLabelText("Removal reason")).toBeRequired();
  await userEvent.type(within(dialog).getByLabelText("Removal reason"), "private pixels");
  await userEvent.click(within(dialog).getByRole("button", { name: "Confirm removal" }));
  expect(removeBugImageAction).toHaveBeenCalledWith({ imageId, reason: "private pixels" });
  expect(await screen.findByText("Image removed")).toBeInTheDocument();
});
it("marks only the displayed snapshot and only owners; a late action response cannot read a later reply", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof markBugReadAction>>) => void;
  vi.mocked(markBugReadAction).mockReturnValue(new Promise((done) => { resolve = done; }));
  const { rerender } = render(<ReporterReadEffect bugId={id} isOwner={false} seenActivitySeq={4} />);
  expect(markBugReadAction).not.toHaveBeenCalled();
  rerender(<ReporterReadEffect bugId={id} isOwner seenActivitySeq={4} />);
  await waitFor(() => expect(markBugReadAction).toHaveBeenCalledWith({ bugId: id, seenActivitySeq: 4 }));
  await act(async () => resolve({ ok: true, data: { readSeq: 4, activitySeq: 5 } }));
  expect(markBugReadAction).toHaveBeenCalledTimes(1); expect(refreshCounts).toHaveBeenCalledTimes(1);
});
it("keeps unavailable historical assignees visible and allows Unassigned", () => {
  const report = { ...detail(), assignedToUserId: "old", assignee: { id: "old", displayName: "Former triager", nickname: null, available: false } };
  render(<BugDetail detail={report} scope="triage" triagers={[]} />);
  expect(screen.getByRole("option", { name: "Former triager (unavailable)" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "" } });
  expect(screen.getByLabelText("Assignee")).toHaveValue("");
});
it("adopts a newly bounded initial window after revalidation while retaining a comment draft", async () => {
  const report = { ...detail(), commentsBefore: null, historyBefore: null };
  const { rerender } = render(<BugDetail detail={report} scope="triage" triagers={[]} />);
  expect(screen.queryByRole("button", { name: "Load older comments" })).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Comment"), "keep this draft");
  rerender(<BugDetail detail={{ ...report, commentsBefore: "new-window", historyBefore: "new-history" }} scope="triage" triagers={[]} />);
  expect(screen.getByRole("button", { name: "Load older comments" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Load older history" })).toBeInTheDocument();
  expect(screen.getByLabelText("Comment")).toHaveValue("keep this draft");
});

it("orders triage screenshot, details, technical context, triage, history and reporter conversation like Almond", () => {
  const report = { ...detail(), comments: [], screenshot: { ...image, kind: "screenshot" as const }, reporter: { id: "reporter", displayName: "Reporter name", nickname: "Report nickname" }, userAgent: "Browser raw user agent", appBuildSha: "1234567890abcdef1234567890abcdef12345678", pageQuery: "view=table" };
  render(<BugDetail detail={report} scope="triage" triagers={[]} />);
  const screenshot = screen.getByText("Screenshot", { selector: "span" });
  const description = screen.getByRole("region", { name: "Details" });
  const technical = screen.getByText("Technical details").closest("details")!;
  const triage = screen.getByRole("region", { name: "Triage" });
  const history = screen.getByRole("region", { name: "Status history" });
  const conversation = screen.getByRole("region", { name: "Ask the reporter" });
  const blocks = [screenshot, description, technical, triage, history, conversation];
  blocks.slice(1).forEach((block, i) => expect(blocks[i].compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
  expect(technical).not.toHaveAttribute("open");
  expect(within(technical).getByText("Report nickname")).toBeInTheDocument();
  expect(within(technical).getByRole("link", { name: "/today?view=table", hidden: true })).toHaveAttribute("href", "/today?view=table");
  expect(within(technical).getByRole("link", { name: "1234567", hidden: true })).toHaveAttribute("href", "https://github.com/example/host-app/commit/1234567890abcdef1234567890abcdef12345678");
  expect(within(technical).getByText("Browser raw user agent")).toBeInTheDocument();
  expect(within(technical).getByText("1 × 1")).toBeInTheDocument();
});

it("renders the reporter's single column detail without triage metadata and keeps the read watermark", async () => {
  const report = { ...detail(), screenshot: { ...image, kind: "screenshot" as const } };
  render(<BugDetail detail={report} scope="mine" triagers={[]} />);
  expect(screen.getByRole("heading", { level: 1, name: report.summary })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Attached screenshot" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Conversation with the team" })).toBeInTheDocument();
  expect(screen.queryByText("Technical details")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Triage" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Status history" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Remove image" })).not.toBeInTheDocument();
  await waitFor(() => expect(markBugReadAction).toHaveBeenCalledWith({ bugId: id, seenActivitySeq: 4 }));
});

it("renders My bug reports as narrow summary rows with an unread dot, Thai date and a status pill", () => {
  const report = detail();
  render(<BugsWorkspace scope="mine" filters={{}} items={[report]} nextCursor={null} detail={null} triagers={[]} />);
  const link = screen.getByRole("link", { name: /private/ });
  expect(link).toHaveAttribute("href", `/bugs/mine/${id}`);
  expect(within(link).getByLabelText("Unread")).toBeInTheDocument();
  expect(within(link).getByText("New")).toBeInTheDocument();
  expect(within(link).getByText("26 ต.ค. 2026")).toBeInTheDocument();
  expect(screen.queryByRole("form", { name: "Bug filters" })).not.toBeInTheDocument();
  expect(screen.queryByText("เลือกรายงานเพื่อดูรายละเอียดและข้อความตอบกลับ")).not.toBeInTheDocument();
});

it("keeps the reporter's detail separate from the list and filter workspace", () => {
  const report = detail();
  render(<BugsWorkspace scope="mine" filters={{}} items={[report]} nextCursor={null} detail={report} triagers={[]} />);
  expect(screen.getByRole("heading", { level: 1, name: report.summary })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "My bug reports" })).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Bug reports" })).not.toBeInTheDocument();
  expect(screen.queryByRole("form", { name: "Bug filters" })).not.toBeInTheDocument();
});
it("uses the chronological server order when multiple events share a millisecond", () => {
  const report = detail();
  report.comments = [{ ...report.comments[0], id: "z-earlier", body: "first at same ms" }, { ...report.comments[0], id: "a-later", body: "second at same ms" }];
  render(<BugDetail detail={report} scope="mine" triagers={[]} />);
  const comments = within(screen.getByRole("list", { name: "Comments" })).getAllByRole("listitem");
  expect(comments[0]).toHaveTextContent("first at same ms");
});
it("retries the uncertain payload and preserves edits made before a successful replay", async () => {
  const report = detail();
  render(<BugDetail detail={report} scope="mine" triagers={[]} />);
  await userEvent.type(screen.getByLabelText("Comment"), "original payload");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByRole("alert");
  await userEvent.clear(screen.getByLabelText("Comment"));
  await userEvent.type(screen.getByLabelText("Comment"), "edited draft");
  vi.mocked(addBugCommentAction).mockResolvedValue({ ok: true, data: { comment: { ...report.comments[0], id: "replayed", isMine: true, body: "original payload", image: null }, activitySeq: 4 } });
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("original payload");
  const retry = vi.mocked(addBugCommentAction).mock.calls[1][0] as FormData;
  expect(retry.get("body")).toBe("original payload");
  expect(screen.getByLabelText("Comment")).toHaveValue("edited draft");
});
it("uses a revalidated image tombstone over a locally sent copy of the same comment", async () => {
  const report = { ...detail(), comments: [] };
  const comment = { id: "sent-image", isMine: true, body: "sent with image", createdAt: "2026-10-26T05:00:00Z", image };
  vi.mocked(addBugCommentAction).mockResolvedValue({ ok: true, data: { comment, activitySeq: 4 } });
  const { rerender } = render(<BugDetail detail={report} scope="mine" triagers={[]} />);
  await userEvent.type(screen.getByLabelText("Comment"), "sent with image");
  fireEvent.change(screen.getByLabelText("Choose comment image"), { target: { files: [new File(["image"], "comment.png", { type: "image/png" })] } });
  await screen.findByRole("img", { name: "Attached image preview" });
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByRole("img", { name: "Comment attachment" })).toBeInTheDocument();
  rerender(<BugDetail detail={{ ...report, comments: [{ ...comment, image: { ...image, removed: true, url: null } }] }} scope="mine" triagers={[]} />);
  expect(screen.getByText("Image removed")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Comment attachment" })).not.toBeInTheDocument();
  expect(within(screen.getByRole("list", { name: "Comments" })).getAllByRole("listitem")).toHaveLength(1);
});

it("places report PDF download after the screenshot and before Details in triage", () => {
  const report = detail();
  const pdfId = "44444444-4444-4444-8444-444444444444";
  report.screenshot = { ...image, kind: "screenshot" };
  report.pdf = { id: pdfId, kind: "report_pdf", mimeType: "application/pdf", fileName: "private-evidence.pdf", byteCount: 8, removed: false, url: `/api/bugs/files/${pdfId}` };
  render(<BugDetail detail={report} scope="triage" triagers={[]} />);
  const download = screen.getByRole("link", { name: /ไฟล์ PDF/ });
  expect(download).toHaveAttribute("download", "private-evidence.pdf");
  expect(screen.getByText("Screenshot", { selector: "span" }).compareDocumentPosition(download) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(download.compareDocumentPosition(screen.getByRole("region", { name: "Details" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("offers a missing report PDF reselect only to its owner", () => {
  const report = detail();
  const view = render(<BugDetail detail={report} scope="mine" triagers={[]} />);
  expect(screen.getByRole("button", { name: "Attach PDF" })).toBeInTheDocument();
  view.rerender(<BugDetail detail={{ ...report, isOwner: false }} scope="triage" triagers={[]} />);
  expect(screen.queryByRole("button", { name: "Attach PDF" })).not.toBeInTheDocument();
});
