import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BugsWorkspace } from "./bugs-workspace";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("./bug-detail", () => ({ BugDetail: () => null }));
const css = readFileSync("src/components/bugs/bug-pages.css", "utf8");
it("uses the shared page heading and a direction-neutral empty detail", () => {
  render(<BugsWorkspace scope="triage" filters={{}} items={[]} detail={null} nextCursor={null} triagers={[]} />);
  const heading = screen.getByRole("heading", { level: 1, name: "Bugs" });
  expect(heading).toHaveClass("page-title");
  expect(heading.closest("header")).toHaveClass("page-header");
  expect(screen.getByText("เลือกรายงานจากรายการเพื่อดูรายละเอียด")).toBeInTheDocument();
});
it("keeps the report list beside a selection failure", () => {
  render(<BugsWorkspace scope="triage" filters={{}} items={[]} detail={null} nextCursor={null} triagers={[]} detailError="ไม่พบรายงานหรือคุณไม่มีสิทธิ์ดูรายงานนี้" />);
  expect(screen.getByRole("alert").closest(".bugs-workspace__detail")).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Bug reports" })).toBeInTheDocument();
});
it("uses shell spacing and action clearance for desktop height and one shared inline alert rule", () => {
  expect(css).toContain("height: calc(100dvh - var(--shell-edge-gap) * 2 - var(--shell-action-clearance, 0px))");
  expect(css).toMatch(/:is\([^)]*\.bugs-detail[^)]*\.bugs-thread[^)]*\.bugs-pdf[^)]*\.bugs-history[^)]*\) \[role="alert"\] \{ color: var\(--negative-ink\); font-size: var\(--text-xs\); \}/);
  expect(css).toContain('.bugs-workspace__list:has(.bugs-list-filters[data-pending="true"]) > .bugs-list { opacity: .5; }');
});
it("renders Mine with a shared heading and client pagination", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], nextCursor: null }) });
  vi.stubGlobal("fetch", fetcher);
  try {
    render(<BugsWorkspace scope="mine" filters={{}} items={[]} detail={null} nextCursor="older" triagers={[]} />);
    expect(screen.getByRole("heading", { level: 1, name: "My bug reports" })).toHaveClass("page-title");
    const list = screen.getByRole("navigation", { name: "Bug reports" });
    const { fireEvent, waitFor } = await import("@testing-library/react");
    fireEvent.click(within(list).getByRole("link", { name: "Load more" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/bugs?cursor=older&scope=mine", { cache: "no-store" }));
  } finally { vi.unstubAllGlobals(); }
});
