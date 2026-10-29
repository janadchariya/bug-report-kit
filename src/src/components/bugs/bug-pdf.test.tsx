import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { attachBugPdfAction, removeBugPdfAction } from "@/app/actions/bugs";
import { BugPdfSlot, retainBugPdf } from "./bug-pdf";

vi.mock("@/app/actions/bugs", () => ({ attachBugPdfAction: vi.fn(), removeBugPdfAction: vi.fn() }));
vi.mock("@/src/components/shell/nav-badges", () => ({ useRefreshNavCounts: () => vi.fn() }));
const bugId = "11111111-1111-4111-8111-111111111111";
const id = "44444444-4444-4444-8444-444444444444";
const pdf = { id, kind: "report_pdf" as const, mimeType: "application/pdf" as const, fileName: "evidence.pdf", byteCount: 8, removed: false, url: `/api/bugs/files/${id}` };
beforeEach(() => vi.resetAllMocks());

it("downloads PDFs only through the private route and honours authoritative removal", async () => {
  const snapshot = {};
  const view = render(<BugPdfSlot bugId={bugId} pdf={pdf} snapshot={snapshot} canRemove={false} canUpload={false} />);
  expect(screen.getByRole("link", { name: /ไฟล์ PDF/ })).toHaveAttribute("href", pdf.url);
  expect(screen.getByRole("link", { name: /ไฟล์ PDF/ })).toHaveAttribute("download", "evidence.pdf");
  expect(screen.queryByRole("button", { name: "Remove PDF" })).not.toBeInTheDocument();
  view.rerender(<BugPdfSlot bugId={bugId} pdf={{ ...pdf, removed: true, url: null }} snapshot={{}} canRemove canUpload={false} />);
  expect(screen.getByText("PDF removed")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByText("evidence.pdf")).not.toBeInTheDocument();
});

it("never links an untrusted PDF URL", () => {
  render(<BugPdfSlot bugId={bugId} pdf={{ ...pdf, url: "https://outside.invalid/private.pdf" }} snapshot={{}} canRemove={false} canUpload={false} />);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("requires a reason to remove a PDF and replaces the download with a tombstone", async () => {
  vi.mocked(removeBugPdfAction).mockResolvedValue({ ok: true, data: { ...pdf, removed: true, url: null } });
  render(<BugPdfSlot bugId={bugId} pdf={pdf} snapshot={{}} canRemove canUpload={false} />);
  await userEvent.click(screen.getByRole("button", { name: "Remove PDF" }));
  expect(screen.getByRole("button", { name: "Confirm removal" })).toBeDisabled();
  await userEvent.type(screen.getByLabelText("Removal reason"), "Private information");
  await userEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
  expect(await screen.findByText("PDF removed")).toBeInTheDocument();
  expect(removeBugPdfAction).toHaveBeenCalledWith({ fileId: id, reason: "Private information" });
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("retries the retained file and requestId from detail and drops it after authoritative removal", async () => {
  const file = new File(["%PDF-1.7"], "retry.pdf", { type: "application/pdf" });
  retainBugPdf({ bugId, requestId: "stable-upload", file });
  vi.mocked(attachBugPdfAction).mockRejectedValueOnce(new Error("unknown")).mockResolvedValueOnce({ ok: true, data: pdf });
  const view = render(<BugPdfSlot bugId={bugId} pdf={null} snapshot={{}} canRemove={false} canUpload />);
  await userEvent.click(screen.getByRole("button", { name: "Retry PDF upload" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("แนบ PDF ไม่สำเร็จ");
  await userEvent.click(screen.getByRole("button", { name: "Retry PDF upload" }));
  await screen.findByRole("link", { name: /ไฟล์ PDF/ });
  for (const [form] of vi.mocked(attachBugPdfAction).mock.calls) {
    expect((form as FormData).get("requestId")).toBe("stable-upload");
    expect((form as FormData).get("pdf")).toBe(file);
  }
  view.rerender(<BugPdfSlot bugId={bugId} pdf={{ ...pdf, removed: true, url: null }} snapshot={{}} canRemove={false} canUpload />);
  expect(screen.getByText("PDF removed")).toBeInTheDocument();
  expect(screen.queryByText("retry.pdf")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Attach PDF" })).not.toBeInTheDocument();
});

it("offers file re-selection on an owner detail after a browser reload", async () => {
  vi.mocked(attachBugPdfAction).mockResolvedValueOnce({ ok: true, data: pdf });
  render(<BugPdfSlot bugId="new-report" pdf={null} snapshot={{}} canRemove={false} canUpload />);
  expect(await screen.findByRole("button", { name: "Attach PDF" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Choose PDF attachment"), { target: { files: [new File(["%PDF-1.7"], "again.pdf", { type: "application/pdf" })] } });
  await waitFor(() => expect(attachBugPdfAction).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole("link", { name: /ไฟล์ PDF/ })).toBeInTheDocument();
});

it("allows authoritative refresh while a failed upload is retained, and lets a fresh tombstone win", async () => {
  const file = new File(["%PDF-1.7"], "private-waiting.pdf", { type: "application/pdf" });
  retainBugPdf({ bugId: "refresh-report", requestId: "refresh-upload", file });
  const view = render(<BugPdfSlot bugId="refresh-report" pdf={null} snapshot={{}} canRemove={false} canUpload />);
  expect(screen.getByRole("button", { name: "Retry PDF upload" }).closest("[data-refresh-managed]")).not.toHaveAttribute("data-refresh-hold");
  view.rerender(<BugPdfSlot bugId="refresh-report" pdf={null} snapshot={{}} canRemove={false} canUpload />);
  expect(screen.getByText(/private-waiting.pdf/)).toBeInTheDocument();
  view.rerender(<BugPdfSlot bugId="refresh-report" pdf={{ ...pdf, removed: true, url: null }} snapshot={{}} canRemove={false} canUpload />);
  expect(screen.getByText("PDF removed")).toBeInTheDocument();
  expect(screen.queryByText(/private-waiting.pdf/)).not.toBeInTheDocument();
});

it("allows choosing a corrected PDF after a known validation refusal", async () => {
  vi.mocked(attachBugPdfAction).mockResolvedValueOnce({ ok: false, code: "invalid_input", reasonCode: null, correlationId: "test" }).mockResolvedValueOnce({ ok: true, data: pdf });
  render(<BugPdfSlot bugId="invalid-report" pdf={null} snapshot={{}} canRemove={false} canUpload />);
  fireEvent.change(screen.getByLabelText("Choose PDF attachment"), { target: { files: [new File(["%PDF-/JS"], "invalid.pdf", { type: "application/pdf" })] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("แนบ PDF ไม่สำเร็จ");
  expect(screen.queryByRole("button", { name: "Retry PDF upload" })).not.toBeInTheDocument();
  expect(screen.queryByText(/invalid.pdf/)).not.toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Attach PDF" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Choose PDF attachment"), { target: { files: [new File(["%PDF-1.7"], "corrected.pdf", { type: "application/pdf" })] } });
  expect(await screen.findByRole("link", { name: /ไฟล์ PDF/ })).toBeInTheDocument();
  const [first, second] = vi.mocked(attachBugPdfAction).mock.calls.map(([value]) => value as FormData);
  expect(second.get("requestId")).not.toBe(first.get("requestId"));
});

it("forgets a private draft and blocks upload after an access refusal", async () => {
  retainBugPdf({ bugId: "revoked-report", requestId: "revoked-upload", file: new File(["%PDF-1.7"], "secret-name.pdf", { type: "application/pdf" }) });
  vi.mocked(attachBugPdfAction).mockResolvedValueOnce({ ok: false, code: "forbidden", reasonCode: null, correlationId: "test" });
  render(<BugPdfSlot bugId="revoked-report" pdf={null} snapshot={{}} canRemove={false} canUpload />);
  await userEvent.click(screen.getByRole("button", { name: "Retry PDF upload" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("สิทธิ์");
  expect(screen.queryByText(/secret-name.pdf/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Attach PDF" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry PDF upload" })).not.toBeInTheDocument();
});

it("treats the service's bug_not_visible refusal as an access failure and forgets the private filename", async () => {
  retainBugPdf({ bugId: "hidden-report", requestId: "hidden-upload", file: new File(["%PDF-1.7"], "hidden-name.pdf", { type: "application/pdf" }) });
  vi.mocked(attachBugPdfAction).mockResolvedValueOnce({ ok: false, code: "rule", reasonCode: "bug_not_visible", correlationId: "test" });
  render(<BugPdfSlot bugId="hidden-report" pdf={null} snapshot={{}} canRemove={false} canUpload />);
  await userEvent.click(screen.getByRole("button", { name: "Retry PDF upload" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("สิทธิ์");
  expect(screen.queryByText(/hidden-name.pdf/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("ignores a stale successful upload response after a refreshed tombstone", async () => {
  let finish!: (value: Awaited<ReturnType<typeof attachBugPdfAction>>) => void;
  vi.mocked(attachBugPdfAction).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const view = render(<BugPdfSlot bugId="stale-report" pdf={null} snapshot={{}} canRemove={false} canUpload />);
  fireEvent.change(screen.getByLabelText("Choose PDF attachment"), { target: { files: [new File(["%PDF-1.7"], "late-private.pdf", { type: "application/pdf" })] } });
  await waitFor(() => expect(attachBugPdfAction).toHaveBeenCalledTimes(1));
  view.rerender(<BugPdfSlot bugId="stale-report" pdf={{ ...pdf, removed: true, url: null }} snapshot={{}} canRemove={false} canUpload />);
  await act(async () => finish({ ok: true, data: pdf }));
  expect(screen.getByText("PDF removed")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByText(/late-private.pdf/)).not.toBeInTheDocument();
});
