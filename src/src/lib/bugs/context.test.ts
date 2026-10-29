import { describe, expect, it } from "vitest";
import { sanitizeBugLocation } from "./context";

describe("bug location privacy", () => {
  it("keeps only route-specific enum filters and strips fragments", () => {
    expect(sanitizeBugLocation({ pathname: "/bugs#customer@example.test", query: "status=in_progress&priority=high&q=customer&token=secret" }))
      .toEqual({ path: "/bugs", query: "status=in_progress&priority=high" });
    expect(sanitizeBugLocation({ pathname: "/bugs/mine", query: "status=done&priority=critical" })).toEqual({ path: "/bugs/mine", query: "status=done" });
    expect(sanitizeBugLocation({ pathname: "/search", query: "q=customer&status=new" })).toEqual({ path: "/search", query: null });
  });
  it("drops duplicate enum keys completely and rejects malicious values", () => {
    expect(sanitizeBugLocation({ pathname: "/bugs", query: "status=new&status=done&priority=customer%40example.test" })).toEqual({ path: "/bugs", query: null });
    expect(sanitizeBugLocation({ pathname: "/bugs", query: { status: ["new", "new"], priority: "low" } })).toEqual({ path: "/bugs", query: "priority=low" });
  });
  it.each(["https://evil.test/bugs", "//evil.test/bugs", "/api/calendar/secret", "/calendar/secret", "/bugs\\mine", "/bugs\n", "/unknown/customer@example.test", "/leads/not-a-uuid", "/leads/%2fsecret", "x".repeat(3000)])("refuses non-app or secret-bearing path %s", (pathname) => {
    expect(sanitizeBugLocation({ pathname, query: "status=new" })).toEqual({ path: "/", query: null });
  });
  it("recognizes current static and UUID detail routes but never keeps their query", () => {
    expect(sanitizeBugLocation({ pathname: "/leads/00000000-0000-4000-8000-000000000001", query: "q=private&status=new" }))
      .toEqual({ path: "/leads/00000000-0000-4000-8000-000000000001", query: null });
    expect(sanitizeBugLocation({ pathname: "/settings/integrations", query: "token=private" })).toEqual({ path: "/settings/integrations", query: null });
    expect(sanitizeBugLocation({ pathname: "/guide/intake_admin", query: "q=customer" })).toEqual({ path: "/guide/intake_admin", query: null });
  });
});
