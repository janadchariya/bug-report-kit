import { fireEvent, render, screen, within } from "@testing-library/react";
import { AnnotationToolbar } from "./annotation-toolbar";

function props() {
  return { tool: "rect" as const, color: "red" as const, canUndo: true, zoom: 1, onToolChange: vi.fn(), onColorChange: vi.fn(), onUndo: vi.fn(), onClear: vi.fn(), onZoomChange: vi.fn() };
}

beforeEach(() => {
  const matchMedia = window.matchMedia;
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ ...matchMedia(query), matches: query === "(pointer: coarse)" }));
});
afterEach(() => vi.restoreAllMocks());

it("offers all four drawing chips, named color dots, and direct actions without a second apply step", () => {
  const handlers = props();
  render(<AnnotationToolbar {...handlers} />);
  const toolbar = screen.getByRole("toolbar", { name: "Annotation tools" });
  expect(within(toolbar).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim())).toEqual([
    "Rectangle", "Ellipse", "Arrow", "Freehand", "Red", "Yellow", "Green", "Undo", "Start over", "Zoom out", "Reset zoom (100%)", "Zoom in",
  ]);
  expect(screen.getByRole("button", { name: "Rectangle" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Red" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Ellipse" }));
  expect(handlers.onToolChange).toHaveBeenLastCalledWith("ellipse");
  fireEvent.click(screen.getByRole("button", { name: "Freehand" }));
  expect(handlers.onToolChange).toHaveBeenLastCalledWith("path");
  fireEvent.click(screen.getByRole("button", { name: "Green" }));
  expect(handlers.onColorChange).toHaveBeenCalledWith("green");
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(handlers.onUndo).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Pan" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Apply|Cancel/ })).not.toBeInTheDocument();
});

it("requires confirmation before Start over removes marks", () => {
  const handlers = props();
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(<AnnotationToolbar {...handlers} />);
  fireEvent.click(screen.getByRole("button", { name: "Start over" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(handlers.onClear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Start over" }));
  expect(handlers.onClear).toHaveBeenCalledOnce();
});

it("deselects the active drawing chip so a touch drag can scroll again without a Pan tool", () => {
  const handlers = props();
  const view = render(<AnnotationToolbar {...handlers} />);
  fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
  expect(handlers.onToolChange).toHaveBeenCalledExactlyOnceWith(null);
  view.rerender(<AnnotationToolbar {...handlers} tool={null} />);
  for (const name of ["Rectangle", "Ellipse", "Arrow", "Freehand"]) expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
  expect(handlers.onToolChange).toHaveBeenLastCalledWith("rect");
  expect(screen.queryByRole("button", { name: "Pan" })).not.toBeInTheDocument();
});

it("zooms in 25 percent steps, resets from the percentage, and stops at 50–300 percent", () => {
  const handlers = props();
  const view = render(<AnnotationToolbar {...handlers} />);
  fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
  expect(handlers.onZoomChange).toHaveBeenLastCalledWith(0.75);
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(handlers.onZoomChange).toHaveBeenLastCalledWith(1.25);
  view.rerender(<AnnotationToolbar {...handlers} zoom={1.5} />);
  expect(screen.getByRole("button", { name: "Reset zoom (150%)" })).toHaveTextContent(/^150%$/);
  fireEvent.click(screen.getByRole("button", { name: "Reset zoom (150%)" }));
  expect(handlers.onZoomChange).toHaveBeenLastCalledWith(1);
  view.rerender(<AnnotationToolbar {...handlers} zoom={0.5} />);
  expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  view.rerender(<AnnotationToolbar {...handlers} zoom={3} />);
  expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
});

it("keeps unavailable undo disabled and locks all controls during image preparation or Send", () => {
  const handlers = props();
  const view = render(<AnnotationToolbar {...handlers} canUndo={false} />);
  expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Start over" })).toBeDisabled();
  view.rerender(<AnnotationToolbar {...handlers} disabled />);
  for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
});

it("uses one toolbar tab stop and arrow keys that wrap past disabled actions", () => {
  render(<AnnotationToolbar {...props()} canUndo={false} />);
  const toolbar = screen.getByRole("toolbar", { name: "Annotation tools" });
  const rectangle = screen.getByRole("button", { name: "Rectangle" });
  expect(within(toolbar).getAllByRole("button").filter((button) => button.tabIndex === 0)).toEqual([rectangle]);
  rectangle.focus();
  fireEvent.keyDown(rectangle, { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "Ellipse" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  expect(screen.getByRole("button", { name: "Zoom in" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  expect(rectangle).toHaveFocus();
  fireEvent.keyDown(rectangle, { key: "Home" });
  for (let step = 0; step < 7; step++) fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "Zoom out" })).toHaveFocus();
  expect(within(toolbar).getAllByRole("button").filter((button) => button.tabIndex === 0)).toEqual([screen.getByRole("button", { name: "Zoom out" })]);
});
