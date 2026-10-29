import { describe, expect, it } from "vitest";
import { parseUserAgent } from "./user-agent";

describe("bounded bug User-Agent parser", () => {
  it.each([
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/122.0.0.0 Safari/537.36", "macOS", "10.15.7", "Chrome", "122.0.0.0", "desktop"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile/15E148 Safari/604.1", "iOS", "17.5", "Safari", "17.5", "mobile"],
    ["Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) Version/17.5 Safari/604.1", "iOS", "17.5", "Safari", "17.5", "tablet"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/124.0", "Windows", "10", "Firefox", "124.0", "desktop"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.2365.92", "Windows", "10", "Edge", "122.0.2365.92", "desktop"],
    ["totally-unknown", null, null, null, null, null],
  ])("ports kit case %s", (ua, osName, osVersion, browserName, browserVersion, deviceType) => {
    expect(parseUserAgent(ua!)).toEqual({ osName, osVersion, browserName, browserVersion, deviceType });
  });
  it("best-effort detects desktop-style iPadOS without mislabelling the OS version", () => {
    expect(parseUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Mobile/15E148 Safari/604.1"))
      .toEqual({ osName: "iPadOS", osVersion: null, browserName: "Safari", browserVersion: "18.0", deviceType: "tablet" });
  });
  it.each(["customer@example.com", "1".repeat(33), "1.2.evil", "12.3/secret"])("never copies a nonnumeric or overlong parsed version: %s", version => {
    expect(parseUserAgent(`Chrome/${version}`).browserVersion).toBeNull();
  });
  it("bounds parsing before detection and retains no raw UA field", () => {
    expect(parseUserAgent(`${"x".repeat(2048)} Chrome/122.0`)).toEqual({ osName: null, osVersion: null, browserName: null, browserVersion: null, deviceType: null });
    expect(parseUserAgent("Android customer@example.com Chrome/1.2")).toEqual({ osName: "Android", osVersion: null, browserName: "Chrome", browserVersion: "1.2", deviceType: null });
  });
});
