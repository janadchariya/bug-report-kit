import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the prisma singleton so importing notify-chat doesn't require DATABASE_URL
// and so we can drive the bug+reporter lookup per test.
const findUnique = vi.fn();
vi.mock("../../lib/db/prisma", () => ({
  prisma: { bugReport: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

const WEBHOOK = "https://chat.googleapis.com/v1/spaces/TEST/messages?key=k&token=t";

describe("notifyReporterOnBugComment", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    findUnique.mockReset();
    fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pings the reporter's personal webhook when someone else comments", async () => {
    findUnique.mockResolvedValue({
      summary: "Submit button does nothing",
      reporterId: "reporter-1",
      reporter: { chatWebhookUrl: WEBHOOK, notifPrefs: null },
    });
    const { notifyReporterOnBugComment } = await import(
      "../../lib/bugs/notify-chat"
    );
    await notifyReporterOnBugComment({
      bugReportId: "bug-abc-123",
      commenterId: "admin-9",
      commenterName: "Jan A.",
      commentBody: "Could you try again and tell me what happens?",
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [calledUrl, calledOpts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(WEBHOOK);
    const cardJson = JSON.stringify(JSON.parse(calledOpts.body as string));
    expect(cardJson).toContain("Submit button does nothing");
    expect(cardJson).toContain("/my-bugs/bug-abc-123");
    expect(cardJson).toContain("Jan A.");
  });

  it("does NOT ping when the reporter comments on their own bug", async () => {
    findUnique.mockResolvedValue({
      summary: "Submit button does nothing",
      reporterId: "reporter-1",
      reporter: { chatWebhookUrl: WEBHOOK, notifPrefs: null },
    });
    const { notifyReporterOnBugComment } = await import(
      "../../lib/bugs/notify-chat"
    );
    await notifyReporterOnBugComment({
      bugReportId: "bug-abc-123",
      commenterId: "reporter-1",
      commenterName: "Reporter",
      commentBody: "any update?",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does nothing when the reporter has no chat webhook", async () => {
    findUnique.mockResolvedValue({
      summary: "Submit button does nothing",
      reporterId: "reporter-1",
      reporter: { chatWebhookUrl: null, notifPrefs: null },
    });
    const { notifyReporterOnBugComment } = await import(
      "../../lib/bugs/notify-chat"
    );
    await notifyReporterOnBugComment({
      bugReportId: "bug-abc-123",
      commenterId: "admin-9",
      commenterName: "Jan A.",
      commentBody: "hi",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("respects the reporter's bugComment chat=false preference", async () => {
    findUnique.mockResolvedValue({
      summary: "Submit button does nothing",
      reporterId: "reporter-1",
      reporter: {
        chatWebhookUrl: WEBHOOK,
        notifPrefs: { bugComment: { chat: false } },
      },
    });
    const { notifyReporterOnBugComment } = await import(
      "../../lib/bugs/notify-chat"
    );
    await notifyReporterOnBugComment({
      bugReportId: "bug-abc-123",
      commenterId: "admin-9",
      commenterName: "Jan A.",
      commentBody: "hi",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
