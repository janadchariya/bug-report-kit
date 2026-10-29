import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, vi } from "vitest";
import { BugCoachmark, dismissBugCoachmark } from "./bug-coachmark";

const STORAGE_KEY = "bug-report-kit.coachmarkSeen";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it("guides a first-time reporter through capturing and sending an image", () => {
  render(<BugCoachmark />);
  const coachmark = screen.getByRole("region", { name: "How to report a bug" });
  expect(coachmark).toHaveAttribute("aria-labelledby");
  expect(within(coachmark).getAllByRole("listitem")).toHaveLength(3);
  expect(within(coachmark).getByText(/แคปหน้าจอที่เจอปัญหา/)).toBeInTheDocument();
  expect(within(coachmark).getByText("กดปุ่มแมลงนี้")).toBeInTheDocument();
  expect(within(coachmark).getByText("วางภาพ (⌘/Ctrl+V) แล้วส่ง")).toBeInTheDocument();
  expect(within(coachmark).getByRole("button", { name: "Got it" })).toBeInTheDocument();
  expect(within(coachmark).getByRole("link", { name: "Learn more" })).toHaveAttribute("href", "/guide#report-a-bug");
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});

it("remembers Got it so a new mount does not repeat the coachmark", () => {
  const view = render(<BugCoachmark />);
  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
  view.unmount();
  render(<BugCoachmark />);
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});

it("does not repeat the instructions for an existing seen marker", () => {
  localStorage.setItem(STORAGE_KEY, "1");
  render(<BugCoachmark />);
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});

it("can be temporarily hidden without consuming the first-time instructions", () => {
  const view = render(<BugCoachmark hidden />);
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  view.rerender(<BugCoachmark hidden={false} />);
  expect(screen.getByRole("region")).toBeInTheDocument();
});

it("omits the coachmark from server HTML without reading browser storage", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Browser storage unavailable on server"); });
  expect(renderToString(<BugCoachmark />)).toBe("");
});

it("skips the coachmark if browser storage reads are blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage blocked"); });
  expect(() => render(<BugCoachmark />)).not.toThrow();
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});

it("still dismisses the current coachmark when browser storage writes fail", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage full"); });
  render(<BugCoachmark />);
  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});

it("allows the FAB to consume the coachmark before opening a report", () => {
  render(<><BugCoachmark /><button onClick={dismissBugCoachmark}>Report a bug</button></>);
  fireEvent.click(screen.getByRole("button", { name: "Report a bug" }));
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
});

it("anchors above its FAB parent so the shell lift moves both together", () => {
  render(<div style={{ position: "fixed", bottom: "130px" }}><BugCoachmark /><button>Report a bug</button></div>);
  const tooltip = screen.getByRole("region");
  const style = getComputedStyle(tooltip);
  expect(style.position).toBe("absolute");
  expect(style.bottom).toBe("calc(100% + 16px)");
  expect(tooltip.parentElement).toContainElement(screen.getByRole("button", { name: "Report a bug" }));
});

it("includes the current operating system capture shortcut", () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
  render(<BugCoachmark />);
  expect(screen.getByText("แคปหน้าจอที่เจอปัญหา (⌘⇧4)")).toBeInTheDocument();
});
