import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { prisma } from "../../lib/db/prisma";
import { createBug } from "../../lib/bugs/create-bug";

let companyId = "";
let userId = "";

beforeAll(async () => {
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("Seed a company first (npm run db:seed)");
  companyId = company.id;
  const user = await prisma.user.findFirst({ where: { companyId } });
  if (!user) throw new Error("Seed a user first");
  userId = user.id;
});

afterEach(async () => {
  await prisma.bugReport.deleteMany({ where: { summary: { startsWith: "[test]" } } });
});

describe("createBug", () => {
  it("inserts row with default status=new and null priority", async () => {
    const bug = await createBug({
      bugId: crypto.randomUUID(),
      companyId,
      reporterId: userId,
      summary: "[test] something broke",
      description: null,
      screenshotPath: `bug-reports/${companyId}/abc/screenshot.png`,
      screenshotWidth: 1024,
      screenshotHeight: 768,
      pageUrl: "https://app.example.com/x",
      viewportWidth: 1024,
      viewportHeight: 768,
      userAgent: "test-ua",
      osName: "macOS",
      osVersion: "14.5",
      browserName: "Chrome",
      browserVersion: "122",
      deviceType: "desktop",
      appBuildSha: "abc1234",
    });
    expect(bug.status).toBe("new");
    expect(bug.priority).toBeNull();
    expect(bug.summary).toBe("[test] something broke");
    expect(bug.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects empty summary", async () => {
    await expect(
      createBug({
        bugId: crypto.randomUUID(),
        companyId,
        reporterId: userId,
        summary: "",
        description: null,
        screenshotPath: `bug-reports/${companyId}/abc/screenshot.png`,
        screenshotWidth: 1,
        screenshotHeight: 1,
        pageUrl: "https://x",
        viewportWidth: 1,
        viewportHeight: 1,
        userAgent: "ua",
        osName: null,
        osVersion: null,
        browserName: null,
        browserVersion: null,
        deviceType: null,
        appBuildSha: null,
      }),
    ).rejects.toThrow(/summary/i);
  });
});
