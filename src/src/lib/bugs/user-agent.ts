import { BUG_LIMITS } from "@/src/domain/bugs";

export interface ParsedUserAgent {
  osName: "iOS" | "iPadOS" | "macOS" | "Android" | "Windows" | "Linux" | null;
  osVersion: string | null;
  browserName: "Edge" | "Firefox" | "Chrome" | "Safari" | null;
  browserVersion: string | null;
  deviceType: "mobile" | "tablet" | "desktop" | null;
}

function version(value: string | undefined): string | null {
  return value && value.length <= 32 && /^\d+(?:[._]\d+)*$/.test(value) ? value.replaceAll("_", ".") : null;
}

/** Finite diagnostic labels; never copy arbitrary UA tokens into parsed fields. */
export function parseUserAgent(raw: string): ParsedUserAgent {
  const ua = raw.slice(0, BUG_LIMITS.userAgent);
  const result: ParsedUserAgent = { osName: null, osVersion: null, browserName: null, browserVersion: null, deviceType: null };
  const ipadDesktop = /Macintosh/.test(ua) && /Mobile\//.test(ua);
  if (/iPad|Tablet/.test(ua) || ipadDesktop) result.deviceType = "tablet";
  else if (/Mobile|iPhone|iPod/.test(ua)) result.deviceType = "mobile";
  else if (/Mozilla|Macintosh|Windows|Linux/.test(ua)) result.deviceType = "desktop";
  if (ipadDesktop) result.osName = "iPadOS";
  else if (/iPhone|iPad|iPod/.test(ua)) {
    result.osName = "iOS";
    result.osVersion = version(ua.match(/(?:CPU(?: iPhone)? OS|iPhone OS) ([^\s;)]+)/)?.[1]);
  } else if (/Mac OS X/.test(ua)) {
    result.osName = "macOS"; result.osVersion = version(ua.match(/Mac OS X ([^\s;)]+)/)?.[1]);
  } else if (/Android/.test(ua)) {
    result.osName = "Android"; result.osVersion = version(ua.match(/Android ([^\s;)]+)/)?.[1]);
  } else if (/Windows NT/.test(ua)) {
    result.osName = "Windows";
    const parsed = version(ua.match(/Windows NT ([^\s;)]+)/)?.[1]);
    result.osVersion = parsed ? ({ "10.0": "10", "6.3": "8.1", "6.2": "8", "6.1": "7" } as Record<string, string>)[parsed] ?? parsed : null;
  } else if (/Linux/.test(ua)) result.osName = "Linux";
  for (const [name, pattern] of [["Edge", /(?:Edg|EdgiOS|EdgA)\/([^\s;)]+)/], ["Firefox", /(?:Firefox|FxiOS)\/([^\s;)]+)/], ["Chrome", /(?:Chrome|CriOS)\/([^\s;)]+)/], ["Safari", /Version\/([^\s;)]+).*Safari/]] as const) {
    const match = ua.match(pattern);
    if (match) { result.browserName = name; result.browserVersion = version(match[1]); break; }
  }
  return result;
}
