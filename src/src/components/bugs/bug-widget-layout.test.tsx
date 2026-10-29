import { readFileSync } from "node:fs";

const tokens = readFileSync("app/tokens.css", "utf8");
const css = readFileSync("src/components/bugs/bug-widget.css", "utf8");
const imageCss = readFileSync("src/components/bugs/bug-images.css", "utf8");

it("uses Almond's round FAB dimensions at the phone and md breakpoints", () => {
  expect(tokens).toContain("--fab-size: 56px;");
  expect(tokens).toContain("--fab-size-md: 64px;");
  expect(css).toMatch(/width:\s*var\(--fab-size\)/);
  expect(css).toMatch(/height:\s*var\(--fab-size\)/);
  expect(css).toMatch(/@media \(min-width: 768px\)[\s\S]*width:\s*var\(--fab-size-md\)/);
  expect(css).toContain("border-radius: var(--radius-pill)");
});

it("keeps the toolbar above Almond's image-first, 360px form layout", () => {
  expect(css).toContain(".ui-dialog-backdrop:has(> .bug-report-dialog) { padding: 16px; }");
  expect(css).toContain("width: min(1024px, 100%)");
  expect(css).toContain("grid-template-columns: minmax(0, 1fr) 360px");
  expect(css).toContain("border-radius: var(--radius-card)");
});

it("bounds the phone's live annotation viewport so a long zoomed image scrolls inside it", () => {
  // A percentage max-height cannot constrain the phone pane's auto-sized grid row.
  expect(tokens).toContain("--bug-canvas-max-height: 480px;");
  const phone = imageCss.split("@media (max-width: 767px)")[1];
  expect(phone).toMatch(/\.bug-report-image\s*>\s*\.bug-annotation__viewport\s*\{[^}]*height:\s*auto;[^}]*max-height:\s*min\(45dvh,\s*var\(--bug-canvas-max-height\)\)/);
});
