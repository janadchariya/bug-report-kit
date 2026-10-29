import { notFound } from "next/navigation";
import { BugsWorkspace } from "@/src/components/bugs/bugs-workspace";
import type { Actor } from "@/src/server/auth/actor";
import { listActiveBugTriagers } from "@/src/server/bugs/access";
import { getBugDetail, listBugs } from "@/src/server/bugs/queries";
import { db } from "@/src/server/db/client";
import { DomainRuleError } from "@/src/server/errors";
import { parseBugFilters, parseBugSelection, type BugSearchParams } from "./filters";

/** Call only after the page's explicit capability guard. Services independently recheck grants. */
export async function loadBugsWorkspace(actor: Actor, scope: "mine" | "triage", raw: BugSearchParams, id?: string) {
  let filters;
  try { filters = parseBugFilters(raw); } catch { notFound(); }
  let selected: string | undefined;
  let detailError: string | undefined;
  if (scope === "triage") {
    try { selected = parseBugSelection(raw); }
    catch { detailError = "ไม่พบรายงานหรือคุณไม่มีสิทธิ์ดูรายงานนี้"; }
  }
  try {
    const [listed, triagers] = await Promise.all([
      listBugs(db, { actor, scope, ...filters }),
      scope === "triage" ? listActiveBugTriagers(db) : [],
    ]);
    const detailId = id ?? (scope === "triage" && !detailError ? selected ?? listed.items[0]?.id : undefined);
    let detail = null;
    if (detailId) {
      try { detail = await getBugDetail(db, { actor, scope, bugId: detailId }); }
      catch (error) {
        if (scope !== "triage" || !(error instanceof DomainRuleError) || error.code !== "bug_not_visible") throw error;
        detailError = "ไม่พบรายงานหรือคุณไม่มีสิทธิ์ดูรายงานนี้";
      }
    }
    return <BugsWorkspace scope={scope} filters={filters} items={listed.items} nextCursor={listed.nextCursor} detail={detail} triagers={triagers} selectedId={selected ?? detail?.id} detailError={detailError} />;
  } catch (error) {
    if (error instanceof DomainRuleError && ["bug_not_visible", "invalid_bug_cursor", "invalid_bug_filter"].includes(error.code)) notFound();
    throw error;
  }
}
