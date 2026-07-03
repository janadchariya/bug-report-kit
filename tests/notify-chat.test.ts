import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BugReport } from "../../lib/bugs/types";

const FAKE_BUG: BugReport = {
  id: "bug-abc-123",
  companyId: "company-1",
  reporterId: "user-1",
  summary: "Submit button does nothing",
  description: "Clicking submit on the form does nothing.",
  screenshotPath: "bug-reports/company-1/bug-abc-123/screenshot.png",
  screenshotWidth: 1440,
  screenshotHeight: 900,
  pageUrl: "https://app.example.com/employee/requests/123",
  viewportWidth: 1440,
  viewportHeight: 900,
  userAgent: "Mozilla/5.0",
  osName: "macOS",
  osVersion: "14",
  browserName: "Chrome",
  browserVersion: "124",
  deviceType: "desktop",
  appBuildSha: "abc1234",
  status: "new",
  priority: null,
  assignedToId: null,
  reporterLastReadAt: null,
  createdAt: "2026-06-08T10:00:00.000Z",
  updatedAt: "2026-06-08T10:00:00.000Z",
};

describe("notifyBugCreated", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOOGLE_CHAT_BUG_WEBHOOK_URL;
  });

  it("does nothing when GOOGLE_CHAT_BUG_WEBHOOK_URL is not set", async () => {
    const { notifyBugCreated } = await import("../../lib/bugs/notify-chat");
    await notifyBugCreated(FAKE_BUG, "Jan A.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls fetch with the webhook URL when env var is set", async () => {
    process.env.GOOGLE_CHAT_BUG_WEBHOOK_URL =
      "https://chat.googleapis.com/v1/spaces/TEST/messages?key=k&token=t";
    const { notifyBugCreated } = await import("../../lib/bugs/notify-chat");
    await notifyBugCreated(FAKE_BUG, "Jan A.");
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [calledUrl, calledOpts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(process.env.GOOGLE_CHAT_BUG_WEBHOOK_URL);
    expect(calledOpts.method).toBe("POST");
    const body = JSON.parse(calledOpts.body as string);
    expect(body.cardsV2).toBeDefined();
    const cardJson = JSON.stringify(body);
    expect(cardJson).toContain("Submit button does nothing");
    expect(cardJson).toContain("bug-abc-123");
  });
});
