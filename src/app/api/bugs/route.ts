import { parseBugFilters, type BugSearchParams } from "@/app/(app)/bugs/filters";
import { requireActor } from "@/src/server/auth/guard";
import { listBugs } from "@/src/server/bugs/queries";
import { db } from "@/src/server/db/client";
import { AuthenticationError, AuthorizationError, DomainRuleError } from "@/src/server/errors";
import { logger } from "@/src/server/logging/logger";
import { safeErrorClass } from "@/src/server/logging/redact";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireActor();
    const query = new URL(request.url).searchParams;
    const scopeValues = query.getAll("scope");
    if (scopeValues.length > 1 || (scopeValues.length && !["mine", "triage"].includes(scopeValues[0]))) return Response.json({ error: "invalid_filter" }, { status: 400, headers });
    const scope = scopeValues[0] === "mine" ? "mine" : "triage";
    const raw: BugSearchParams = {};
    for (const key of ["status", "priority", "assignee", "q", "cursor"]) {
      const values = query.getAll(key);
      if (values.length) raw[key] = values.length === 1 ? values[0] : values;
    }
    let filters;
    try { filters = parseBugFilters(raw); }
    catch { return Response.json({ error: "invalid_filter" }, { status: 400, headers }); }
    const page = await listBugs(db, { actor, scope, ...filters });
    return Response.json(page, { headers });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: "unauthenticated" }, { status: 401, headers });
    if (error instanceof AuthorizationError || (error instanceof DomainRuleError && error.code === "bug_not_visible")) return Response.json({ error: "not_found" }, { status: 404, headers });
    if (error instanceof DomainRuleError && ["invalid_bug_filter", "invalid_bug_cursor", "invalid_bug_limit"].includes(error.code)) return Response.json({ error: "invalid_filter" }, { status: 400, headers });
    logger.error({ event: "bug_list.failed", errorClass: safeErrorClass(error) });
    return Response.json({ error: "unavailable" }, { status: 500, headers });
  }
}
