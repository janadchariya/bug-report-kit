import { randomInt, randomUUID } from "node:crypto";
import { and, count, eq, inArray, like, sql } from "drizzle-orm";
import { z } from "zod";
import { assertLocalDatabaseUrl } from "../../scripts/db-reset";
import { normalizeCompanyName } from "@/src/lib/normalize";
import { PERMISSIONS, toGrants, type Permission } from "@/src/lib/permissions";
import { loadActorByUserId } from "@/src/server/auth/actor";
import { loadCurrentRolePermissions } from "@/src/server/auth/role-permissions";
import { updateBug } from "@/src/server/bugs/commands";
import { db } from "@/src/server/db/client";
import { bugReportComments, bugReportImages, bugReports } from "@/src/server/db/schema/bugs";
import { chatWebhooks } from "@/src/server/db/schema/chat";
import { contacts, leads } from "@/src/server/db/schema/crm";
import { rolePermissionVersions } from "@/src/server/db/schema/role-permissions";
import { users } from "@/src/server/db/schema/users";

const fixtureCells = [
  { role: "bd", permission: "bugs.report", granted: true },
  { role: "bd", permission: "bugs.triage", granted: false },
  { role: "finance", permission: "bugs.report", granted: true },
  { role: "finance", permission: "bugs.triage", granted: false },
  { role: "md", permission: "bugs.report", granted: true },
  { role: "md", permission: "bugs.triage", granted: true },
] as const satisfies readonly { role: "bd" | "finance" | "md"; permission: Permission; granted: boolean }[];
const cellSchema = z.strictObject({ role: z.enum(["bd", "finance", "md"]), permission: z.enum(PERMISSIONS), granted: z.boolean() });
const stateSchema = z.strictObject({ token: z.uuidv4(), userIds: z.array(z.uuid()).length(3), leadId: z.uuid(), originalCells: z.array(cellSchema).length(fixtureCells.length) });

/** Local test DB only; three isolated users, one synthetic Lead, and no webhook credentials. */
export async function runR19Bugs(options: { reason?: string; fixtureState?: string }): Promise<Record<string, string>> {
  const target = process.env.DATABASE_URL ?? "";
  assertLocalDatabaseUrl(target, process.env.APP_ENVIRONMENT);
  if (!/^\/[a-z0-9_]*(?:test|e2e)[a-z0-9_]*$/.test(new URL(target).pathname)) throw new Error("r19_test_database_required");
  if (options.fixtureState) {
    const state = stateSchema.parse(JSON.parse(options.fixtureState));
    if (!state.originalCells.every((cell, index) => cell.role === fixtureCells[index].role && cell.permission === fixtureCells[index].permission)) throw new Error("r19_fixture_grants_invalid");
    const [ownedUsers, ownedLeads] = await Promise.all([
      db.select({ id: users.id, status: users.status }).from(users).where(and(inArray(users.id, state.userIds), like(users.email, `r19.${state.token}.%@example.test`))),
      db.select({ id: leads.id, archivedAt: leads.archivedAt }).from(leads).where(and(eq(leads.id, state.leadId), eq(leads.companyName, `R19 ${state.token}`))),
    ]);
    if (ownedUsers.length !== 3 || ownedLeads.length !== 1) throw new Error("r19_fixture_not_owned");
    if (options.reason === "cleanup") {
      // Retrying successful cleanup must not require an active triager or replay old grants.
      if (ownedUsers.every(user => user.status === "inactive") && ownedLeads[0].archivedAt) {
        return { leadId: state.leadId, companyLabel: "R19 fixture closed" };
      }
      await db.transaction(async tx => {
        const actor = await loadActorByUserId(tx, state.userIds[2]);
        if (!actor) throw new Error("r19_fixture_triager_missing");
        const reports = await tx.select({ id: bugReports.id, status: bugReports.status, version: bugReports.version }).from(bugReports).where(inArray(bugReports.reporterUserId, state.userIds));
        for (const report of reports) if (report.status === "new" || report.status === "in_progress") {
          await updateBug(tx, { actor, bugId: report.id, expectedVersion: report.version, patch: { status: "cancelled" },
            reason: "R19 isolated fixture closed", now: new Date(), correlationId: randomUUID() });
        }
        const current = await loadCurrentRolePermissions(tx), grants = toGrants(current.matrix);
        // Restore only our temporary cells; keep every unrelated permission change.
        for (const cell of state.originalCells) grants[cell.role][cell.permission] = cell.granted;
        await tx.insert(rolePermissionVersions).values({ version: current.version + 1, grants, reason: "Restore isolated R19 fixture grants", createdAt: new Date() });
        const now = new Date();
        await tx.update(leads).set({ archivedAt: now, archiveReason: "R19 isolated fixture closed", updatedAt: now }).where(eq(leads.id, state.leadId));
        await tx.update(users).set({ status: "inactive", deactivatedAt: now, updatedAt: now }).where(inArray(users.id, state.userIds));
      });
      return { leadId: state.leadId, companyLabel: "R19 fixture closed" };
    }
    if (options.reason !== "inspect") throw new Error("r19_fixture_operation_invalid");
    const reports = await db.select({ id: bugReports.id, summary: bugReports.summary, description: bugReports.description, status: bugReports.status,
      activity: bugReports.reporterActivitySeq, read: bugReports.reporterReadSeq }).from(bugReports).where(inArray(bugReports.reporterUserId, state.userIds));
    const reportIds = reports.map(report => report.id);
    const [images, comments, webhookCount] = await Promise.all([
      reportIds.length ? db.select({ id: bugReportImages.id, reportId: bugReportImages.bugReportId, width: bugReportImages.width, height: bugReportImages.height,
        byteCount: bugReportImages.byteCount, storedBytes: sql<number | null>`octet_length(${bugReportImages.content})`,
        removedBy: bugReportImages.removedByUserId, removedAt: bugReportImages.removedAt, reason: bugReportImages.removedReason,
      }).from(bugReportImages).where(inArray(bugReportImages.bugReportId, reportIds)) : [],
      reportIds.length ? db.select({ reportId: bugReportComments.bugReportId, total: count() }).from(bugReportComments).where(inArray(bugReportComments.bugReportId, reportIds)).groupBy(bugReportComments.bugReportId) : [],
      db.$count(chatWebhooks, inArray(chatWebhooks.userId, state.userIds)),
    ]);
    return { leadId: state.leadId, companyLabel: "R19 inspection", webhookCount: String(webhookCount),
      reports: JSON.stringify(reports.map(report => ({ ...report, comments: comments.find(row => row.reportId === report.id)?.total ?? 0, images: images.filter(image => image.reportId === report.id) }))) };
  }
  if (options.reason) throw new Error("r19_fixture_state_required");
  const token = randomUUID(), now = new Date();
  // The shared factories bind the global db; use this transaction for every seed write
  // so a failure before returning fixtureState cannot leave active fixture users behind.
  return db.transaction(async tx => {
    const makeUser = async (key: string, role: typeof fixtureCells[number]["role"]) => {
      const [user] = await tx.insert(users).values({ email: `r19.${token}.${key}@example.test`,
        displayName: `R19 ${token.slice(0, 8)} ${key}`, roles: [role], loginMethod: "workspace" }).returning();
      return user;
    };
    const reporter = await makeUser("reporter", "bd"), stranger = await makeUser("stranger", "finance");
    // Bug triage must not add another Admin to the shared browser database.
    const triager = await makeUser("triager", "md");
    const [contact] = await tx.insert(contacts).values({ fullName: "R19 synthetic contact",
      phoneE164: `+668${randomInt(10_000_000, 100_000_000)}`, isPrimary: true }).returning();
    const companyLabel = `R19 ${token}`;
    const [lead] = await tx.insert(leads).values({ companyName: companyLabel, companyNameNormalized: normalizeCompanyName(companyLabel),
      primaryContactId: contact.id, ownerUserId: reporter.id, submittedByUserId: reporter.id,
      services: ["creative"], entryPoint: "line_oa", sourceKind: "admin", routingMode: "claim_offer",
      stage: "connected", grade: "B", isLegacy: true, submittedAt: now, firstCustomerContactAt: now, firstRealContactAt: now,
      stageChangedAt: now, claimedAt: now }).returning();
    const current = await loadCurrentRolePermissions(tx), grants = toGrants(current.matrix);
    const originalCells = fixtureCells.map(cell => ({ role: cell.role, permission: cell.permission, granted: grants[cell.role][cell.permission] }));
    for (const cell of fixtureCells) grants[cell.role][cell.permission] = cell.granted;
    await tx.insert(rolePermissionVersions).values({ version: current.version + 1, grants, reason: "Isolated R19 fixture permissions", createdAt: now });
    return { leadId: lead.id, companyLabel, reporterId: reporter.id, reporterEmail: reporter.email, strangerId: stranger.id, strangerEmail: stranger.email,
      triagerId: triager.id, triagerEmail: triager.email,
      fixtureState: JSON.stringify({ token, userIds: [reporter.id, stranger.id, triager.id], leadId: lead.id, originalCells }) };
  });
}
