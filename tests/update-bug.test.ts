import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { prisma } from "../../lib/db/prisma";
import { createBug } from "../../lib/bugs/create-bug";
import { updateBug } from "../../lib/bugs/update-bug";

let companyId = "";
let adminId = "";
let userA = "";

beforeAll(async () => {
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("Seed required");
  companyId = company.id;
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("Need an ADMIN user");
  adminId = admin.id;
  const user = await prisma.user.findFirst({ where: { companyId, NOT: { id: adminId } } });
  if (!user) throw new Error("Need a non-admin user");
  userA = user.id;
});

afterEach(async () => {
  await prisma.bugReport.deleteMany({ where: { summary: { startsWith: "[test]" } } });
});

async function seedBug() {
  return createBug({
    bugId: crypto.randomUUID(),
    companyId,
    reporterId: userA,
    summary: "[test] update",
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

describe("updateBug", () => {
  it("changes status and appends a status change row", async () => {
    const bug = await seedBug();
    await updateBug({
      id: bug.id,
      changedById: adminId,
      patch: { status: "in_progress" },
      note: "starting work",
    });
    const changes = await prisma.bugReportStatusChange.findMany({
      where: { bugReportId: bug.id },
    });
    expect(changes).toHaveLength(1);
    expect(changes[0].fromStatus).toBe("NEW");
    expect(changes[0].toStatus).toBe("IN_PROGRESS");
    expect(changes[0].note).toBe("starting work");
    expect(changes[0].changedById).toBe(adminId);
  });

  it("updates priority without appending a status row", async () => {
    const bug = await seedBug();
    await updateBug({
      id: bug.id,
      changedById: adminId,
      patch: { priority: "high" },
    });
    const fresh = await prisma.bugReport.findUnique({ where: { id: bug.id } });
    expect(fresh?.priority).toBe("HIGH");
    const changes = await prisma.bugReportStatusChange.count({ where: { bugReportId: bug.id } });
    expect(changes).toBe(0);
  });

  it("does not append history when status unchanged", async () => {
    const bug = await seedBug();
    await updateBug({
      id: bug.id,
      changedById: adminId,
      patch: { status: "new", priority: "low" },
    });
    const changes = await prisma.bugReportStatusChange.count({ where: { bugReportId: bug.id } });
    expect(changes).toBe(0);
  });
});
