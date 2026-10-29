import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { updateBugAction } from "@/app/actions/bugs";
import type { BugDetail as Detail } from "@/src/lib/bugs/types";
import { BugDetail } from "./bug-detail";

vi.mock("@/app/actions/bugs", () => ({ updateBugAction: vi.fn(), addBugCommentAction: vi.fn(), attachBugPdfAction: vi.fn(), removeBugPdfAction: vi.fn(), removeBugImageAction: vi.fn(), loadBugThreadAction: vi.fn() }));
vi.mock("@/src/components/shell/nav-badges", () => ({ useRefreshNavCounts: () => vi.fn() }));
vi.mock("./reporter-read-effect", () => ({ ReporterReadEffect: () => null }));

const id = "11111111-1111-4111-8111-111111111111";
const pdfId = "44444444-4444-4444-8444-444444444444";
const pdf = { id: pdfId, kind: "report_pdf" as const, mimeType: "application/pdf" as const, fileName: "evidence.pdf", byteCount: 8, removed: false, url: `/api/bugs/files/${pdfId}` };
const detail = (overrides: Partial<Detail> = {}): Detail => ({ id, summary: "Report summary", description: null, status: "new", priority: null, assigned: false, version: 1, reporterActivitySeq: 0, reporterReadSeq: 0, unread: false, isOwner: true, createdAt: "2026-10-26T03:00:00Z", updatedAt: "2026-10-26T03:00:00Z", pagePath: "/today", pageQuery: "", viewportWidth: 800, viewportHeight: 600, osName: null, osVersion: null, browserName: null, browserVersion: null, deviceType: null, appBuildSha: null, screenshot: null, comments: [], statusChanges: [], commentsBefore: null, historyBefore: null, seenActivitySeq: 0, ...overrides });

beforeEach(() => vi.resetAllMocks());

it.each(["mine", "triage"] as const)("only offers report PDF attachment to its reporter while open and still missing a PDF in %s", (scope) => {
  const view = render(<BugDetail detail={detail()} scope={scope} triagers={[]} />);
  expect(screen.getByRole("button", { name: "Attach PDF" })).toBeEnabled();
  for (const status of ["new", "in_progress"] as const) {
    view.rerender(<BugDetail detail={detail({ status })} scope={scope} triagers={[]} />);
    expect(screen.getByRole("button", { name: "Attach PDF" })).toBeEnabled();
    view.rerender(<BugDetail detail={detail({ status, isOwner: false })} scope={scope} triagers={[]} />);
    expect(screen.queryByRole("button", { name: "Attach PDF" })).not.toBeInTheDocument();
  }
  for (const status of ["done", "cancelled"] as const) {
    view.rerender(<BugDetail detail={detail({ status })} scope={scope} triagers={[]} />);
    expect(screen.queryByRole("button", { name: "Attach PDF" })).not.toBeInTheDocument();
  }
  for (const attachment of [pdf, { ...pdf, removed: true, url: null }]) {
    view.rerender(<BugDetail detail={detail({ pdf: attachment })} scope={scope} triagers={[]} />);
    expect(screen.queryByRole("button", { name: "Attach PDF" })).not.toBeInTheDocument();
  }
});

it.each(["mine", "triage"] as const)("presents the report PDF inside an Attached PDF card in %s", (scope) => {
  render(<BugDetail detail={detail({ pdf })} scope={scope} triagers={[]} />);
  const card = screen.getByRole("region", { name: "Attached PDF" });
  expect(card).toHaveClass("bugs-detail-card");
  expect(within(card).getByRole("heading", { name: "Attached PDF" })).toBeInTheDocument();
  expect(within(card).getByRole("link", { name: /ไฟล์ PDF/ })).toHaveAttribute("href", pdf.url);
});

it("requires a dirty triage form before enabling Save changes and disables it again after saving", async () => {
  vi.mocked(updateBugAction).mockResolvedValue({ ok: true, data: { id, version: 2, status: "new" } });
  render(<BugDetail detail={detail()} scope="triage" triagers={[]} />);
  const save = screen.getByRole("button", { name: "Save changes" });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "high" } });
  expect(save).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "" } });
  expect(save).toBeDisabled();
  expect(updateBugAction).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "high" } });
  fireEvent.click(save);
  await waitFor(() => expect(save).toHaveTextContent("Save changes"));
  expect(save).toBeDisabled();
});

it("explains that the reporter can reply with images and PDFs", () => {
  render(<BugDetail detail={detail()} scope="mine" triagers={[]} />);
  expect(screen.getByText("ช่องนี้ไว้สื่อสารกับทีม — คุณสามารถตอบกลับหรือส่งรูป / ไฟล์ PDF เพิ่มเติมได้")).toBeInTheDocument();
});

it("uses the shared page heading pattern for the reporter's detail", () => {
  render(<BugDetail detail={detail()} scope="mine" triagers={[]} />);
  const heading = screen.getByRole("heading", { level: 1, name: "Report summary" });
  expect(heading).toHaveClass("page-title");
  expect(heading.closest("header")).toHaveClass("page-header");
  expect(heading.closest("header")).toHaveTextContent("New");
  expect(heading.closest("header")).toHaveTextContent("26 ต.ค. 2026");
});
