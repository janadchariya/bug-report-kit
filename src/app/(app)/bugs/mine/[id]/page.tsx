import { requireActorOrRedirect } from "@/src/server/auth/guard";
import { loadBugsWorkspace } from "../../load-workspace";
import type { BugSearchParams } from "../../filters";

export const metadata = { title: "My bug report" };
export default async function MineDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<BugSearchParams> }) {
  const actor = await requireActorOrRedirect("bugs.report");
  return loadBugsWorkspace(actor, "mine", await searchParams ?? {}, (await params).id);
}
