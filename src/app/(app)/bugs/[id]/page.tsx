import { notFound, redirect } from "next/navigation";
import { requireActorOrRedirect } from "@/src/server/auth/guard";
import { getBugDetail } from "@/src/server/bugs/queries";
import { db } from "@/src/server/db/client";
import { DomainRuleError } from "@/src/server/errors";
import { bugListUrl, parseBugFilters, type BugSearchParams } from "../filters";

export const metadata = { title: "Bug report" };
export default async function BugPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<BugSearchParams> }) {
  const actor = await requireActorOrRedirect("bugs.triage");
  let filters;
  try { filters = parseBugFilters(await searchParams ?? {}); } catch { notFound(); }
  const { id } = await params;
  try { await getBugDetail(db, { actor, scope: "triage", bugId: id }); }
  catch (error) {
    if (error instanceof DomainRuleError && error.code === "bug_not_visible") notFound();
    throw error;
  }
  redirect(bugListUrl("triage", filters, id));
}
