import { describe, expect, test } from "vitest";
import { attachErrorText, captureShortcut, encodingsFor, imageExtension, sendsAsIs, shrinkFactor } from "./image";

const MB = 1024 * 1024;

describe("screenshot size rules", () => {
  test("PNG is tried first, then WebP and JPEG; later rounds only the lossy ones", () => {
    expect(encodingsFor(0).map(([type]) => type)).toEqual(["image/png", "image/webp", "image/jpeg"]);
    expect(encodingsFor(1).map(([type]) => type)).toEqual(["image/webp", "image/jpeg"]);
  });

  test("the shrink follows the area ratio and stays between 0.3 and 0.9", () => {
    expect(shrinkFactor(8 * MB, 4 * MB)).toBeCloseTo(Math.sqrt(0.5) * 0.95);
    expect(shrinkFactor(4.1 * MB, 4 * MB)).toBe(0.9);
    expect(shrinkFactor(400 * MB, 4 * MB)).toBe(0.3);
  });

  test("a thread image goes as it is under 4 MB, except a GIF", () => {
    expect(sendsAsIs({ type: "image/png", size: 4 * MB })).toBe(true);
    expect(sendsAsIs({ type: "image/png", size: 4 * MB + 1 })).toBe(false);
    expect(sendsAsIs({ type: "image/gif", size: 10 })).toBe(false);
    expect(sendsAsIs({ type: "image/svg+xml", size: 10 })).toBe(false);
  });

  test("hints, errors and file names", () => {
    expect(captureShortcut("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("⌘⇧4");
    expect(captureShortcut("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("⊞⇧S");
    expect(captureShortcut(null)).toBe("your screenshot tool");
    expect(attachErrorText("too_large")).toMatch(/15 MB/);
    expect(attachErrorText("not_image")).toMatch(/PNG, JPG/);
    expect([imageExtension("image/jpeg"), imageExtension("image/webp"), imageExtension("image/png")]).toEqual(["jpg", "webp", "png"]);
  });
});
