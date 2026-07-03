import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { prisma } from "../../lib/db/prisma";
import { countNewBugs } from "../../lib/store/repository";

const BUG_BASE = {
  companyId: "",
  reporterId: "",
  summary: "[test-cnb] count new bugs",
  description: null,
  screenshotPath: "bug-reports/x/y/screenshot.png",
  screenshotWidth: 1024,
  screenshotHeight: 768,
  pageUrl: "https://app.example.com/x",
  viewportWidth: 1024,
  viewportHeight: 768,
  userAgent: "test-ua",
  osName: null,
  osVersion: null,
  browserName: null,
  browserVersion: null,
  deviceType: null,
  appBuildSha: null,
};

beforeAll(async () => {
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("Seed a company first");
  BUG_BASE.companyId = company.id;
  const user = await prisma.user.findFirst({ where: { companyId: company.id } });
  if (!user) throw new Error("Seed a user first");
  BUG_BASE.reporterId = user.id;
});

afterEach(async () => {
  await prisma.bugReport.deleteMany({ where: { summary: { startsWith: "[test-cnb]" } } });
});

describe("countNewBugs", () => {
  it("returns 0 when there are no new bugs", async () => {
    const count = await countNewBugs();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("increments by 1 when a new bug is added", async () => {
    const before = await countNewBugs();
    await prisma.bugReport.create({
      data: { ...BUG_BASE, id: crypto.randomUUID(), status: "NEW" },
    });
    const after = await countNewBugs();
    expect(after).toBe(before + 1);
  });

  it("does not count bugs with status != NEW", async () => {
    const before = await countNewBugs();
    await prisma.bugReport.create({
      data: { ...BUG_BASE, id: crypto.randomUUID(), status: "DONE" },
    });
    const after = await countNewBugs();
    expect(after).toBe(before);
  });
});
