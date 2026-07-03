import {
  parseUserAgent,
  type ParsedUserAgent,
} from "@/lib/bugs/user-agent";

export type ClientContext = ParsedUserAgent & {
  userAgent: string;
  pageUrl: string;
  viewportWidth: number;
  viewportHeight: number;
  appBuildSha: string | null;
};

export function collectClientContext(): ClientContext {
  const ua = navigator.userAgent;
  const parsed = parseUserAgent(ua);
  return {
    ...parsed,
    userAgent: ua,
    pageUrl: window.location.href,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    appBuildSha: process.env.NEXT_PUBLIC_BUILD_SHA ?? null,
  };
}
