import { File } from "node:buffer";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { db } from "@/src/server/db/client";
import { bugReportImages, bugReports } from "@/src/server/db/schema/bugs";
import { users } from "@/src/server/db/schema/users";
import { ValidationError } from "@/src/server/errors";
import { buildTestActor } from "@/tests/fixtures/actor";
import { createUser } from "@/tests/fixtures/factories";
import { setRolePermissions } from "@/tests/fixtures/role-permissions";
import { truncateAll } from "@/tests/setup/truncate";
import { readBugImage, validateBugImage } from "./images";

const content = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c63f80f040009fb03fdfb5e6b2b0000000049454e44ae426082", "hex");
beforeEach(truncateAll);

async function fixture() {
  const reporter = await createUser({ roles: ["bd"] });
  const triager = await createUser({ roles: ["md"] });
  const stranger = await createUser({ roles: ["bd"] });
  const [report] = await db.insert(bugReports).values({ reporterUserId: reporter.id, requestId: randomUUID(), summary: "Synthetic image test", pagePath: "/today", viewportWidth: 800, viewportHeight: 600, userAgent: "Synthetic" }).returning();
  const [image] = await db.insert(bugReportImages).values({ bugReportId: report.id, kind: "screenshot", content, mimeType: "image/png", width: 1, height: 1, byteCount: content.length, uploadedByUserId: reporter.id }).returning();
  return { reporter, triager, stranger, image };
}

it("permits no file and sniffs the bytes despite false MIME and extension", async () => {
  expect(await validateBugImage(null)).toBeNull();
  expect(await validateBugImage(undefined)).toBeNull();
  const result = await validateBugImage(new File([content], "customer-name.svg", { type: "text/plain" }));
  expect(result).toEqual({ content, mimeType: "image/png", width: 1, height: 1, byteCount: content.length });
});

it("refuses oversized/empty/SVG files and normalizes malformed file objects safely", async () => {
  for (const file of [new File([new Uint8Array(2_097_153)], "a.png"), new File([], "empty.png"), new File(["<svg/>"], "spoof.png", { type: "image/png" })]) {
    await expect(validateBugImage(file)).rejects.toBeInstanceOf(ValidationError);
  }
  await expect(validateBugImage({ size: 1, arrayBuffer: () => content } as unknown as File)).rejects.toBeInstanceOf(ValidationError);
});

it("returns bytes only to the own reporter and effective triager, with server-sniffed MIME", async () => {
  const { reporter, triager, image } = await fixture();
  for (const user of [reporter, triager]) {
    expect(await readBugImage(db, { actor: await buildTestActor(user.id), imageId: image.id }))
      .toEqual({ content, mimeType: "image/png", width: 1, height: 1, byteCount: content.length });
  }
});

it("refuses strangers before any query selects image content", async () => {
  const { stranger, image } = await fixture();
  const actor = await buildTestActor(stranger.id);
  const select = vi.spyOn(db, "select");
  try {
    await expect(readBugImage(db, { actor, imageId: image.id })).rejects.toMatchObject({ code: "bug_not_visible" });
    expect(select.mock.calls.every(([selection]) => !selection || !("content" in selection))).toBe(true);
  } finally { select.mockRestore(); }
});

it("freshly refuses inactive actors and uniformly hides unknown or removed images", async () => {
  const { reporter, image } = await fixture();
  const actor = await buildTestActor(reporter.id);
  await expect(readBugImage(db, { actor, imageId: randomUUID() })).rejects.toMatchObject({ code: "bug_not_visible" });
  await db.update(users).set({ status: "inactive" }).where(eq(users.id, reporter.id));
  await expect(readBugImage(db, { actor, imageId: image.id })).rejects.toMatchObject({ code: "bug_not_visible" });
  await db.update(users).set({ status: "active" }).where(eq(users.id, reporter.id));
  await db.update(bugReportImages).set({ content: null, removedByUserId: reporter.id, removedAt: new Date(), removedReason: "Synthetic removal" }).where(eq(bugReportImages.id, image.id));
  await expect(readBugImage(db, { actor, imageId: image.id })).rejects.toMatchObject({ code: "bug_not_visible" });
});

it("uses effective delegated/revoked permissions and permits triage without report or Lead permissions", async () => {
  const { reporter, triager, stranger, image } = await fixture();
  const oldReporterActor = await buildTestActor(reporter.id);
  const oldTriagerActor = await buildTestActor(triager.id);
  await setRolePermissions({ bd: { "bugs.report": false }, md: { "bugs.triage": false } });
  for (const actor of [oldReporterActor, oldTriagerActor]) {
    await expect(readBugImage(db, { actor, imageId: image.id })).rejects.toMatchObject({ code: "bug_not_visible" });
  }
  await setRolePermissions({ bd: { "bugs.report": false, "bugs.triage": true, "lead.work_own": false } });
  const delegated = await buildTestActor(stranger.id);
  expect(await readBugImage(db, { actor: delegated, imageId: image.id })).toMatchObject({ content, mimeType: "image/png" });
});
