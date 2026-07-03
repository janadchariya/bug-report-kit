import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { prisma } from "../../lib/db/prisma";
import { createBug } from "../../lib/bugs/create-bug";
import { listBugs } from "../../lib/bugs/list-bugs";

let companyId = "";
let userA = "";
let userB = "";

beforeAll(async () => {
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("Seed required");
  companyId = company.id;
  const users = await prisma.user.findMany({ where: { companyId }, take: 2 });
  if (users.length < 2) throw new Error("Need >= 2 seeded users");
  userA = users[0].id;
  userB = users[1].id;
});

afterEach(async () => {
  await prisma.bugReport.deleteMany({ where: { summary: { startsWith: "[test]" } } });
});

async function seedBug(reporterId: string, summary: string) {
  return createBug({
    bugId: crypto.randomUUID(),
    companyId,
    reporterId,
    summary,
    description: null,
    screenshotPath: `bug-reports/${companyId}/x/screenshot.png`,
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
  });
}

describe("listBugs", () => {
  it("admin sees all bugs in company", async () => {
    await seedBug(userA, "[test] one");
    await seedBug(userB, "[test] two");
    const { items } = await listBugs({
      viewer: { id: userA, role: "ADMIN", companyId },
      limit: 50,
    });
    const titles = items.map((b) => b.summary).filter((s) => s.startsWith("[test]"));
    expect(titles).toEqual(expect.arrayContaining(["[test] one", "[test] two"]));
  });

  it("non-admin sees only own bugs", async () => {
    await seedBug(userA, "[test] mine");
    await seedBug(userB, "[test] theirs");
    const { items } = await listBugs({
      viewer: { id: userA, role: "EMPLOYEE", companyId },
      limit: 50,
    });
    const titles = items.map((b) => b.summary).filter((s) => s.startsWith("[test]"));
    expect(titles).toContain("[test] mine");
    expect(titles).not.toContain("[test] theirs");
  });

  it("filters by status", async () => {
    const bug = await seedBug(userA, "[test] filtered");
    await prisma.bugReport.update({ where: { id: bug.id }, data: { status: "IN_PROGRESS" } });
    const { items } = await listBugs({
      viewer: { id: userA, role: "ADMIN", companyId },
      status: "in_progress",
      limit: 50,
    });
    expect(items.some((b) => b.id === bug.id)).toBe(true);
    const { items: newOnly } = await listBugs({
      viewer: { id: userA, role: "ADMIN", companyId },
      status: "new",
      limit: 50,
    });
    expect(newOnly.some((b) => b.id === bug.id)).toBe(false);
  });
});
