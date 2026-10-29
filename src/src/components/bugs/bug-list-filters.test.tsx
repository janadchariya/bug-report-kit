import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Suspense, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AutoRefresh } from "@/src/components/shell/auto-refresh";
import { BugListFilters } from "./bug-list-filters";
const { replace, router } = vi.hoisted(() => { const replace = vi.fn(); return { replace, router: { replace, refresh: vi.fn() } }; });
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/src/components/shell/nav-badges", () => ({ useNavBadges: () => ({ pollResult: "success" }) }));
beforeEach(() => { replace.mockReset(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());
it("uses status GET pills and immediately applies selects while preserving summary searches", () => {
  render(<BugListFilters filters={{ status: "new", q: "Save" }} triagers={[]} />);
  expect(screen.getByRole("link", { name: "New" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", "/bugs?status=done&q=Save");
  fireEvent.change(screen.getByRole("combobox", { name: "Priority" }), { target: { value: "high" } });
  expect(replace).toHaveBeenCalledWith("/bugs?status=new&priority=high&q=Save", { scroll: false });
  expect(screen.queryByRole("button", { name: "Apply filters" })).not.toBeInTheDocument();
  const form = screen.getByRole("form", { name: "Bug filters" });
  expect(form).toHaveAttribute("method", "get"); expect(form).toHaveAttribute("action", "/bugs");
  expect(renderToStaticMarkup(<BugListFilters filters={{}} triagers={[]} />)).toContain('<noscript><button type="submit">Apply filters</button></noscript>');
});
it("debounces summary by 300 ms, bounds it to 100 characters and keeps staff labels in the assignee slot", () => {
  render(<BugListFilters filters={{}} triagers={[{ id: "staff", displayName: "Staff", nickname: "Nick" }]} />);
  const search = screen.getByRole("searchbox", { name: "Search summary" });
  expect(search).toHaveAttribute("maxLength", "100");
  fireEvent.change(search, { target: { value: "Save%" } });
  expect(search).toHaveValue("Save%");
  act(() => vi.advanceTimersByTime(299));
  expect(replace).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(replace).toHaveBeenCalledWith("/bugs?q=Save%25", { scroll: false });
  expect(within(screen.getByRole("combobox", { name: "Assignee" })).getByRole("option", { name: "Nick" })).toHaveValue("staff");
});
it("keeps the summary search focused while changed GET filters render", () => {
  const { rerender } = render(<BugListFilters filters={{}} triagers={[]} />);
  const search = screen.getByRole("searchbox", { name: "Search summary" });
  act(() => search.focus());
  fireEvent.change(search, { target: { value: "Save" } });
  rerender(<BugListFilters filters={{ q: "Save" }} triagers={[]} />);
  expect(screen.getByRole("searchbox", { name: "Search summary" })).toBe(search);
  expect(search).toHaveFocus();
});

it("resumes shell refresh after changing and leaving GET navigation filters", async () => {
  vi.useFakeTimers(); router.refresh.mockReset();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  try {
    render(<><AutoRefresh /><BugListFilters filters={{}} triagers={[]} /></>);
    const priority = screen.getByRole("combobox", { name: "Priority" });
    act(() => priority.focus());
    fireEvent.change(priority, { target: { value: "high" } });
    await act(async () => { vi.advanceTimersByTime(45_000); });
    expect(router.refresh).not.toHaveBeenCalled();
    act(() => priority.blur());
    await act(async () => { vi.advanceTimersByTime(45_000); });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});

it("keeps locally typed search over stale server props until focus leaves", () => {
  const { rerender } = render(<BugListFilters filters={{ q: "old" }} triagers={[]} />);
  const search = screen.getByRole("searchbox");
  act(() => search.focus());
  fireEvent.change(search, { target: { value: "new search" } });
  rerender(<BugListFilters filters={{ q: "stale" }} triagers={[]} />);
  expect(search).toHaveValue("new search");
  act(() => vi.advanceTimersByTime(300));
  expect(replace).toHaveBeenLastCalledWith("/bugs?q=new+search", { scroll: false });
  act(() => search.blur());
  rerender(<BugListFilters filters={{ q: "back navigation" }} triagers={[]} />);
  expect(search).toHaveValue("back navigation");
});
it("adopts a server query deferred during focus before the next Priority change", () => {
  const selectedId = "11111111-1111-4111-8111-111111111111";
  const { rerender } = render(<BugListFilters filters={{ q: "old query" }} triagers={[]} selectedId={selectedId} />);
  const search = screen.getByRole<HTMLInputElement>("searchbox");
  act(() => { search.focus(); search.setSelectionRange(1, 3); });
  rerender(<BugListFilters filters={{ q: "server query" }} triagers={[]} selectedId={selectedId} />);
  expect(screen.getByRole("searchbox")).toBe(search);
  expect(search).toHaveFocus();
  expect(search).toHaveValue("old query");
  expect(search.selectionStart).toBe(1);
  expect(search.selectionEnd).toBe(3);
  act(() => search.blur());
  expect(search).toHaveValue("server query");
  act(() => vi.advanceTimersByTime(300));
  expect(replace).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox", { name: "Priority" }), { target: { value: "high" } });
  expect(replace).toHaveBeenCalledExactlyOnceWith(`/bugs?priority=high&q=server+query&selected=${selectedId}`, { scroll: false });
});
it.each([
  { action: "types a newer query", value: "new local search", url: "/bugs?priority=high&q=new+local+search" },
  { action: "clears the query", value: "", url: "/bugs?priority=high" },
])("keeps local input when the user $action after a focused server update", ({ value, url }) => {
  const { rerender } = render(<BugListFilters filters={{ q: "old query" }} triagers={[]} />);
  const search = screen.getByRole("searchbox");
  act(() => search.focus());
  rerender(<BugListFilters filters={{ q: "server query" }} triagers={[]} />);
  fireEvent.change(search, { target: { value } });
  act(() => search.blur());
  expect(search).toHaveValue(value);
  expect(replace).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox", { name: "Priority" }), { target: { value: "high" } });
  expect(replace).toHaveBeenCalledExactlyOnceWith(url, { scroll: false });
  act(() => vi.advanceTimersByTime(300));
  expect(replace).toHaveBeenCalledTimes(1);
});
it.each([
  { serverQuery: "latest server query", value: "latest server query", url: "/bugs?priority=high&q=latest+server+query" },
  { serverQuery: undefined, value: "", url: "/bugs?priority=high" },
])("adopts the latest focused server update on blur when typing preceded that update ($value)", ({ serverQuery, value, url }) => {
  const { rerender } = render(<BugListFilters filters={{ q: "old query" }} triagers={[]} />);
  const search = screen.getByRole("searchbox");
  act(() => search.focus());
  rerender(<BugListFilters filters={{ q: "first server query" }} triagers={[]} />);
  fireEvent.change(search, { target: { value: "intermediate local query" } });
  act(() => vi.advanceTimersByTime(300));
  expect(replace).toHaveBeenCalledExactlyOnceWith("/bugs?q=intermediate+local+query", { scroll: false });
  replace.mockClear();
  rerender(<BugListFilters filters={{ q: serverQuery }} triagers={[]} />);
  expect(search).toHaveValue("intermediate local query");
  act(() => search.blur());
  expect(search).toHaveValue(value);
  expect(replace).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox", { name: "Priority" }), { target: { value: "high" } });
  expect(replace).toHaveBeenCalledExactlyOnceWith(url, { scroll: false });
});
it("preserves selected report in all filter links, selects, debounced search and GET fallback", () => {
  const selectedId = "11111111-1111-4111-8111-111111111111";
  render(<BugListFilters filters={{ q: "Save" }} triagers={[]} selectedId={selectedId} />);
  expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", `/bugs?status=done&q=Save&selected=${selectedId}`);
  expect(screen.getByRole("form").querySelector('input[name="selected"]')).toHaveValue(selectedId);
  fireEvent.change(screen.getByRole("combobox", { name: "Priority" }), { target: { value: "high" } });
  expect(replace).toHaveBeenLastCalledWith(`/bugs?priority=high&q=Save&selected=${selectedId}`, { scroll: false });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Changed" } });
  act(() => vi.advanceTimersByTime(300));
  expect(replace).toHaveBeenLastCalledWith(`/bugs?priority=high&q=Changed&selected=${selectedId}`, { scroll: false });
  fireEvent.click(screen.getByRole("link", { name: "Done" }));
  expect(replace).toHaveBeenLastCalledWith(`/bugs?status=done&priority=high&q=Changed&selected=${selectedId}`, { scroll: false });
});

it("shows pending navigation feedback while the filter transition waits for its route", async () => {
  let resolve!: () => void;
  let ready = false;
  const wait = new Promise<void>((done) => { resolve = () => { ready = true; done(); }; });
  function Route({ changed }: { changed: boolean }) {
    if (changed && !ready) throw wait;
    return <p>{changed ? "Filtered route" : "Current route"}</p>;
  }
  function Harness() {
    const [changed, setChanged] = useState(false);
    replace.mockImplementation(() => setChanged(true));
    return <><BugListFilters filters={{}} triagers={[]} /><Route changed={changed} /></>;
  }
  render(<Suspense fallback={<p>Route fallback</p>}><Harness /></Suspense>);
  fireEvent.change(screen.getByRole("combobox", { name: "Priority" }), { target: { value: "high" } });
  expect(screen.getByRole("status")).toHaveTextContent("กำลังโหลด…");
  expect(screen.getByRole("form")).toHaveAttribute("data-pending", "true");
  expect(screen.getByText("Current route")).toBeInTheDocument();
  await act(async () => resolve());
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByText("Filtered route")).toBeInTheDocument();
});

it("keeps a newly picked status when another filter changes before route props arrive", () => {
  render(<BugListFilters filters={{ status: "new" }} triagers={[]} />);
  fireEvent.click(screen.getByRole("link", { name: "Done" }));
  expect(replace).toHaveBeenLastCalledWith("/bugs?status=done", { scroll: false });
  fireEvent.change(screen.getByRole("combobox", { name: "Priority" }), { target: { value: "high" } });
  expect(replace).toHaveBeenLastCalledWith("/bugs?status=done&priority=high", { scroll: false });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Save" } });
  act(() => vi.advanceTimersByTime(300));
  expect(replace).toHaveBeenLastCalledWith("/bugs?status=done&priority=high&q=Save", { scroll: false });
});
