import { requireActorOrRedirect } from "@/src/server/auth/guard";
import { loadBugsWorkspace } from "./load-workspace";
import type { BugSearchParams } from "./filters";

export const metadata = { title: "Bugs" };
export default async function BugsPage({ searchParams }: { searchParams?: Promise<BugSearchParams> }) {
  const actor = await requireActorOrRedirect("bugs.triage");
  return loadBugsWorkspace(actor, "triage", await searchParams ?? {});
}
