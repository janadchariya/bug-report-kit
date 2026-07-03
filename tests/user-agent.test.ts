import { describe, it, expect } from "vitest";
import { parseUserAgent } from "../../lib/bugs/user-agent";

describe("parseUserAgent", () => {
  it("parses Chrome on macOS", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    expect(parseUserAgent(ua)).toEqual({
      osName: "macOS",
      osVersion: "10.15.7",
      browserName: "Chrome",
      browserVersion: "122.0.0.0",
      deviceType: "desktop",
    });
  });

  it("parses Safari on iOS (mobile)", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    const r = parseUserAgent(ua);
    expect(r.osName).toBe("iOS");
    expect(r.browserName).toBe("Safari");
    expect(r.deviceType).toBe("mobile");
  });

  it("parses iPad as tablet", () => {
    const ua =
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1";
    expect(parseUserAgent(ua).deviceType).toBe("tablet");
  });

  it("parses Firefox on Windows", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0";
    const r = parseUserAgent(ua);
    expect(r.osName).toBe("Windows");
    expect(r.osVersion).toBe("10");
    expect(r.browserName).toBe("Firefox");
    expect(r.browserVersion).toBe("124.0");
    expect(r.deviceType).toBe("desktop");
  });

  it("parses Edge on Windows", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.2365.92";
    const r = parseUserAgent(ua);
    expect(r.browserName).toBe("Edge");
    expect(r.browserVersion).toBe("122.0.2365.92");
  });

  it("returns nulls for unknown UA", () => {
    const r = parseUserAgent("totally-unknown");
    expect(r.osName).toBeNull();
    expect(r.browserName).toBeNull();
    expect(r.deviceType).toBeNull();
  });
});
