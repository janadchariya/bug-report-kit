/**
 * Server-side User-Agent string parser. Returns nulls when fields can't be
 * detected — fields are nullable in the DB. Order of `match()` blocks below
 * matters: Edge UA contains "Chrome" so test Edge first; iPad UA contains
 * "Macintosh" on iPadOS, but iPad detection runs first.
 */
import type { BugDeviceType } from "./types";

export type ParsedUserAgent = {
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  browserVersion: string | null;
  deviceType: BugDeviceType | null;
};

export function parseUserAgent(ua: string): ParsedUserAgent {
  return {
    ...parseOs(ua),
    ...parseBrowser(ua),
    deviceType: parseDevice(ua),
  };
}

function parseOs(ua: string): Pick<ParsedUserAgent, "osName" | "osVersion"> {
  // iOS / iPadOS
  let m = ua.match(/(?:iPhone|iPad|iPod)[^;)]*?OS (\d+)[_.](\d+)(?:[_.](\d+))?/);
  if (m) {
    const ver = [m[1], m[2], m[3]].filter(Boolean).join(".");
    return { osName: "iOS", osVersion: ver };
  }
  // macOS
  m = ua.match(/Mac OS X (\d+)[_.](\d+)(?:[_.](\d+))?/);
  if (m) {
    const ver = [m[1], m[2], m[3]].filter(Boolean).join(".");
    return { osName: "macOS", osVersion: ver };
  }
  // Android
  m = ua.match(/Android (\d+(?:\.\d+)*)/);
  if (m) return { osName: "Android", osVersion: m[1] };
  // Windows
  m = ua.match(/Windows NT (\d+\.\d+)/);
  if (m) {
    const map: Record<string, string> = {
      "10.0": "10",
      "6.3": "8.1",
      "6.2": "8",
      "6.1": "7",
    };
    return { osName: "Windows", osVersion: map[m[1]] ?? m[1] };
  }
  // Linux (catch-all)
  if (/Linux/.test(ua)) return { osName: "Linux", osVersion: null };
  return { osName: null, osVersion: null };
}

function parseBrowser(
  ua: string,
): Pick<ParsedUserAgent, "browserName" | "browserVersion"> {
  // Edge — must come before Chrome (Edge UA contains "Chrome")
  let m = ua.match(/Edg\/(\S+)/);
  if (m) return { browserName: "Edge", browserVersion: m[1] };
  // Firefox
  m = ua.match(/Firefox\/(\S+)/);
  if (m) return { browserName: "Firefox", browserVersion: m[1] };
  // Chrome (but not Edge — handled above)
  m = ua.match(/Chrome\/(\S+)/);
  if (m) return { browserName: "Chrome", browserVersion: m[1] };
  // Safari — must come after Chrome (Chrome UA contains "Safari")
  m = ua.match(/Version\/(\S+).*Safari/);
  if (m) return { browserName: "Safari", browserVersion: m[1] };
  return { browserName: null, browserVersion: null };
}

function parseDevice(ua: string): BugDeviceType | null {
  if (/iPad|Tablet/.test(ua)) return "tablet";
  if (/Mobile|iPhone|iPod|Android.*Mobile/.test(ua)) return "mobile";
  if (/Mozilla|Macintosh|Windows|Linux/.test(ua)) return "desktop";
  return null;
}
