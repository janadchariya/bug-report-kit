import { requireActorOrRedirect } from "@/src/server/auth/guard";
import { loadBugsWorkspace } from "../load-workspace";
import type { BugSearchParams } from "../filters";

export const metadata = { title: "My bug reports" };
export default async function MinePage({ searchParams }: { searchParams?: Promise<BugSearchParams> }) {
  const actor = await requireActorOrRedirect("bugs.report");
  return loadBugsWorkspace(actor, "mine", await searchParams ?? {});
}
