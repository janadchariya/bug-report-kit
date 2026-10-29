import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BugList } from "./bug-list";
import { BugPriorityBadge, BugStatusBadge } from "./bug-badges";
import type { BugListItem } from "@/src/lib/bugs/types";

const id = "11111111-1111-4111-8111-111111111111";
const item = (over: Partial<BugListItem> = {}): BugListItem => ({
  id, summary: "Save failed", status: "new", priority: "high", assigned: false,
  version: 1, reporterActivitySeq: 0, reporterReadSeq: 0, unread: false,
  createdAt: "2026-10-28T03:55:00Z", updatedAt: "2026-10-28T03:55:00Z",
  reporter: { id: "reporter", displayName: "Synthetic Reporter", nickname: "Reporter" }, ...over,
});
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-28T04:00:00Z")));
afterEach(() => vi.restoreAllMocks());
it("groups All cards in status order and selects with GET links while rendering escaped summaries", () => {
  render(<BugList scope="triage" filters={{}} selectedId={id} nextCursor={null} items={[
    item({ id: "done", status: "done", summary: "Completed" }), item({ summary: "<script>Save failed</script>" }),
    item({ id: "cancelled", status: "cancelled", summary: "Cancelled report" }), item({ id: "progress", status: "in_progress", summary: "Started" }),
  ]} />);
  expect(screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent)).toEqual(["New(1)", "In progress(1)", "Done(1)", "Cancelled(1)"]);
  const card = screen.getByRole("link", { name: /Save failed/ });
  expect(card).toHaveAttribute("href", `/bugs?selected=${id}`);
  expect(card).toHaveAttribute("aria-current", "page");
  expect(within(card).getByText("Reporter")).toBeInTheDocument();
  expect(within(card).getByText("5 นาที")).toBeInTheDocument();
  expect(document.querySelector("script")).toBeNull();
});
it("shows a lazy private thumbnail without bytes and omits removed or absent screenshots", () => {
  const first = { ...item(), screenshotImageId: "image-id" };
  render(<BugList scope="triage" filters={{ status: "new" }} nextCursor={null} items={[first, item({ id: "missing", summary: "No image" })]} />);
  const images = document.querySelectorAll("img");
  expect(images).toHaveLength(1);
  expect(images[0]).toHaveAttribute("src", "/api/bugs/images/image-id");
  expect(images[0]).toHaveAttribute("loading", "lazy");
  expect(images[0]).toHaveAttribute("decoding", "async");
  expect(images[0]).toHaveAttribute("width", "80"); expect(images[0]).toHaveAttribute("height", "56");
  expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
});
it("appends opaque cursor pages on Load more and retains cards after a failed load", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ items: [item({ id: "older", summary: "Older report" })], nextCursor: "cursor_two" }) })
    .mockRejectedValueOnce(new Error("offline"));
  vi.stubGlobal("fetch", fetcher);
  render(<BugList scope="triage" filters={{ status: "new" }} selectedId={id} items={[item()]} nextCursor="opaque_cursor" />);
  fireEvent.click(screen.getByRole("link", { name: "Load more" }));
  expect(await screen.findByText("Older report")).toBeInTheDocument();
  expect(screen.getByText("Save failed")).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledWith("/api/bugs?status=new&cursor=opaque_cursor", { cache: "no-store" });
  fireEvent.click(screen.getByRole("link", { name: "Load more" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("โหลดรายงานไม่สำเร็จ");
  expect(screen.getByText("Older report")).toBeInTheDocument();
  vi.unstubAllGlobals();
});
it("maps badges to Almond status and priority meanings, including the High ring", () => {
  render(<><BugStatusBadge status="new" /><BugStatusBadge status="in_progress" /><BugStatusBadge status="done" /><BugStatusBadge status="cancelled" /><BugPriorityBadge priority="medium" /><BugPriorityBadge priority="high" /></>);
  expect(screen.getByText("New")).toHaveClass("bugs-badge--blue");
  expect(screen.getByText("In progress")).toHaveClass("bugs-badge--amber");
  expect(screen.getByText("Done")).toHaveClass("bugs-badge--green");
  expect(screen.getByText("Cancelled")).toHaveClass("bugs-badge--grey");
  expect(screen.getByText("Medium")).toHaveClass("bugs-badge--yellow");
  expect(screen.getByText("High")).toHaveClass("bugs-badge--orange", "bugs-badge--ring");
});
it("retains appended cards while selecting an older card and refreshing initial server rows", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [item({ id: "older", summary: "Older report" })], nextCursor: null }) }));
  const { rerender } = render(<BugList scope="triage" filters={{}} selectedId={id} items={[item()]} nextCursor="cursor" />);
  fireEvent.click(screen.getByRole("link", { name: "Load more" }));
  expect(await screen.findByText("Older report")).toBeInTheDocument();
  rerender(<BugList scope="triage" filters={{}} selectedId="older" items={[item({ summary: "Refreshed first card" })]} nextCursor="cursor" />);
  expect(screen.getByRole("link", { name: /Older report/ })).toHaveAttribute("aria-current", "page");
  expect(screen.getByText("Refreshed first card")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Load more" })).not.toBeInTheDocument();
  vi.unstubAllGlobals();
});
it("preserves every loaded report across insertions at the first-page boundary and continues from the loaded cursor", async () => {
  const reports = Array.from({ length: 101 }, (_, index) => item({ id: `report-${index + 1}`, summary: `Report ${index + 1}` }));
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ items: reports.slice(50, 100), nextCursor: "cursor_100" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ items: reports.slice(100), nextCursor: null }) });
  vi.stubGlobal("fetch", fetcher);
  try {
    const { rerender } = render(<BugList scope="triage" filters={{}} selectedId="report-1" items={reports.slice(0, 50)} nextCursor="cursor_50" />);
    fireEvent.click(screen.getByRole("link", { name: "Load more" }));
    expect(await screen.findByText("Report 100")).toBeInTheDocument();

    const firstPage = [item({ id: "newest", summary: "Newest report" }), ...reports.slice(0, 49)];
    firstPage[49] = { ...firstPage[49], summary: "Updated report 49" };
    rerender(<BugList scope="triage" filters={{}} selectedId="report-75" items={firstPage} nextCursor="cursor_49" />);
    expect(screen.getByText("Report 50")).toBeInTheDocument();
    expect(screen.getByText("Newest report")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Report \d+ / })).toHaveLength(99);
    expect(screen.getByRole("link", { name: /Report 75 / })).toHaveAttribute("aria-current", "page");

    // A second insertion pushes an updated overlapping row into the retained range.
    const shiftedPage = [item({ id: "newer", summary: "Newer report" }), ...firstPage.slice(0, 49)];
    rerender(<BugList scope="triage" filters={{}} selectedId="report-80" items={shiftedPage} nextCursor="cursor_48" />);
    expect(screen.getByText("Updated report 49")).toBeInTheDocument();
    expect(screen.getByText("Report 50")).toBeInTheDocument();
    expect(screen.queryByText("Report 49")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".bugs-list__item")).toHaveLength(102);
    expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute("href", "/bugs?cursor=cursor_100");

    fireEvent.click(screen.getByRole("link", { name: "Load more" }));
    expect(await screen.findByText("Report 101")).toBeInTheDocument();
    expect(fetcher).toHaveBeenLastCalledWith("/api/bugs?cursor=cursor_100", { cache: "no-store" });
    expect(screen.getByText("Report 50")).toBeInTheDocument();
    expect(document.querySelectorAll(".bugs-list__item")).toHaveLength(103);
    expect(screen.queryByRole("link", { name: "Load more" })).not.toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});
it("reflects the guarded default selection in the URL without another request", () => {
  window.history.replaceState(null, "", "/bugs?status=new");
  render(<BugList scope="triage" filters={{ status: "new" }} selectedId={id} items={[item()]} nextCursor={null} />);
  expect(window.location.pathname + window.location.search).toBe(`/bugs?status=new&selected=${id}`);
  window.history.replaceState(null, "", "/");
});
it("keeps a pending page across selection and clears displaced head rows with appended rows on refresh", async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise((done) => { resolve = done; })));
  try {
    const { rerender } = render(<BugList scope="triage" filters={{}} selectedId={id} items={[item(), item({ id: "boundary", summary: "Boundary private summary" })]} nextCursor="cursor" />);
    fireEvent.click(screen.getByRole("link", { name: "Load more" }));
    const freshHead = [item({ id: "newest", summary: "New report" }), item()];
    rerender(<BugList scope="triage" filters={{}} selectedId="boundary" items={freshHead} nextCursor="fresh_cursor" />);
    expect(screen.getByRole("link", { name: "Loading…" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Boundary private summary")).toBeInTheDocument();
    await act(async () => {
      resolve({ ok: true, json: async () => ({ items: [item({ id: "older", summary: "Appended private summary" })], nextCursor: null }) });
    });
    expect(screen.getByText("Appended private summary")).toBeInTheDocument();
    expect(document.querySelectorAll(".bugs-list__item")).toHaveLength(4);
    expect(screen.queryByRole("link", { name: "Load more" })).not.toBeInTheDocument();

    rerender(<BugList scope="triage" filters={{}} selectedId="boundary" items={[...freshHead]} nextCursor="fresh_cursor" />);
    expect(screen.queryByText("Boundary private summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Appended private summary")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute("href", "/bugs?cursor=fresh_cursor");
  } finally {
    vi.unstubAllGlobals();
  }
});
it("drops accumulated private cards on an authoritative refresh of the same selection", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [item({ id: "older", summary: "Old private summary" })], nextCursor: null }) }));
  const { rerender } = render(<BugList scope="triage" filters={{}} selectedId={id} items={[item()]} nextCursor="cursor" />);
  fireEvent.click(screen.getByRole("link", { name: "Load more" }));
  expect(await screen.findByText("Old private summary")).toBeInTheDocument();
  rerender(<BugList scope="triage" filters={{}} selectedId={id} items={[item({ summary: "Updated server card" })]} nextCursor="fresh_cursor" />);
  expect(screen.queryByText("Old private summary")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Load more" })).toHaveAttribute("href", "/bugs?cursor=fresh_cursor");
  vi.unstubAllGlobals();
});
it("does not restore an older pending page after an authoritative refresh", async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise((done) => { resolve = done; })));
  const { rerender } = render(<BugList scope="triage" filters={{}} selectedId={id} items={[item()]} nextCursor="cursor" />);
  fireEvent.click(screen.getByRole("link", { name: "Load more" }));
  rerender(<BugList scope="triage" filters={{}} selectedId={id} items={[item({ summary: "Updated" })]} nextCursor={null} />);
  await import("@testing-library/react").then(({ act }) => act(async () => {
    resolve({ ok: true, json: async () => ({ items: [item({ id: "older", summary: "Stale private summary" })], nextCursor: null }) });
  }));
  expect(screen.queryByText("Stale private summary")).not.toBeInTheDocument();
  expect(screen.getByText("Updated")).toBeInTheDocument();
  vi.unstubAllGlobals();
});

it("tags PDF reports in the card footer without exposing a private filename or file bytes", () => {
  render(<BugList scope="triage" filters={{}} nextCursor={null} items={[item({ hasPdf: true }), item({ id: "no-pdf", summary: "No PDF", hasPdf: false })]} />);
  const tagged = screen.getByRole("link", { name: /Save failed/ });
  expect(within(tagged).getByText("PDF")).toBeInTheDocument();
  expect(within(screen.getByRole("link", { name: /No PDF/ })).queryByText("PDF")).not.toBeInTheDocument();
  expect(tagged).not.toHaveTextContent(".pdf");
});

it("keeps an icon placeholder for removed thumbnails without exposing a private image URL", () => {
  render(<BugList scope="triage" filters={{}} items={[item({ screenshotImageId: null })]} nextCursor={null} />);
  const card = screen.getByRole("link", { name: /Save failed/ });
  const placeholder = card.querySelector(".bugs-list__thumbnail--placeholder");
  expect(placeholder).toBeInTheDocument();
  expect(placeholder?.querySelector("svg")).toBeInTheDocument();
  expect(card.querySelector("img")).toBeNull();
});
it("appends Mine pages with unread dots and Thai dates and preserves rows on failure", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ items: [item({ id: "older", summary: "Older mine", unread: true })], nextCursor: "two" }) }).mockRejectedValueOnce(new Error("offline"));
  vi.stubGlobal("fetch", fetcher);
  try {
    render(<BugList scope="mine" filters={{}} items={[item()]} nextCursor="opaque" />);
    fireEvent.click(screen.getByRole("link", { name: "Load more" }));
    const older = await screen.findByRole("link", { name: /Older mine/ });
    expect(screen.getByText("Save failed")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/bugs?cursor=opaque&scope=mine", { cache: "no-store" });
    expect(older).toHaveAttribute("href", "/bugs/mine/older");
    expect(within(older).getByLabelText("Unread")).toBeInTheDocument();
    expect(within(older).getByText("28 ต.ค. 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("โหลดรายงานไม่สำเร็จ");
    expect(older).toBeInTheDocument();
  } finally { vi.unstubAllGlobals(); }
});
