import { describe, expect, test, vi } from "vitest";
import { BugRequestError, createBugClient } from "./bug-client";

// Ported from the old PR's bug-client.test.ts, over a fake fetch instead of the old write transport.

const context = {
  userAgent: "UA",
  pageUrl: "http://127.0.0.1:3401/my-work",
  viewportWidth: 1440,
  viewportHeight: 900,
  osName: "macOS",
  osVersion: "15.1",
  browserName: "Chrome",
  browserVersion: "141",
  deviceType: "desktop" as const,
  appBuildSha: null,
};

function fakeFetch(answer: (path: string, init: RequestInit) => Response) {
  const calls: { path: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input);
    if (path === "/api/session") return Response.json({ csrf: "token-1" });
    calls.push({ path, init });
    return answer(path, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}
const headersOf = (init: RequestInit) => init.headers as Record<string, string>;

describe("bug client", () => {
  test("sends a report as one multipart request with the CSRF token: details as JSON and the image as file", async () => {
    const { fetchImpl, calls } = fakeFetch(() => Response.json({ id: "b1" }, { status: 201 }));
    const client = createBugClient(fetchImpl);
    const blob = new Blob(["x"], { type: "image/webp" });
    await expect(client.create({ summary: "Broken", description: null, image: { blob, width: 800, height: 600 }, context })).resolves.toEqual({ id: "b1" });
    const [{ path, init }] = calls;
    expect([path, init.method, headersOf(init)["x-a10-csrf"], headersOf(init)["Content-Type"]]).toEqual(["/api/bugs", "POST", "token-1", undefined]);
    const form = init.body as FormData;
    expect(JSON.parse(String(form.get("meta")))).toEqual({
      summary: "Broken",
      description: null,
      screenshot_width: 800,
      screenshot_height: 600,
      page_url: context.pageUrl,
      viewport_width: 1440,
      viewport_height: 900,
      user_agent: "UA",
      os_name: "macOS",
      os_version: "15.1",
      browser_name: "Chrome",
      browser_version: "141",
      device_type: "desktop",
      app_build_sha: null,
    });
    expect((form.get("file") as File).name).toBe("screenshot.webp");
  });

  test("turns a refusal into a BugRequestError with the server's message and code", async () => {
    const { fetchImpl } = fakeFetch(() => Response.json({ error: "Please wait a few seconds before sending another report.", code: "RATE_LIMITED" }, { status: 429 }));
    const error = await createBugClient(fetchImpl).comment("b1", "hi").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BugRequestError);
    expect(error).toMatchObject({ status: 429, code: "RATE_LIMITED", message: expect.stringMatching(/wait a few seconds/) });
    const big = await createBugClient(fakeFetch(() => new Response("", { status: 413 })).fetchImpl).comment("b1", "hi").catch((e: unknown) => e);
    expect(big).toMatchObject({ status: 413, message: "The image is too large" });
  });

  test("the list filters go in a JSON body; reads have no token; triage and read marks send JSON with the token", async () => {
    const { fetchImpl, calls } = fakeFetch(() => Response.json({ items: [], next_cursor: null }));
    const client = createBugClient(fetchImpl);
    await client.list({ status: "in_progress", q: "board", mine: true, cursor: "c1" });
    await client.counts();
    await client.update("b 1", { status: "done" });
    await client.markRead("b1");
    expect(calls.map(({ path, init }) => [path, init.method, init.body ?? null, headersOf(init)["x-a10-csrf"] ?? null])).toEqual([
      ["/api/bugs/search", "POST", JSON.stringify({ status: "in_progress", q: "board", mine: true, cursor: "c1" }), null],
      ["/api/bugs/counts", "GET", null, null],
      ["/api/bugs/b%201/update", "POST", JSON.stringify({ status: "done" }), "token-1"],
      ["/api/bugs/b1/read", "POST", "{}", "token-1"],
    ]);
  });

  test("a network failure reads as a connection problem", async () => {
    const client = createBugClient((async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    await expect(client.counts()).rejects.toMatchObject({ status: 0, message: /Could not reach A10/ });
  });
});
