import { BugGuide } from "@/app/(app)/guide/bug-guide";
import { requireActorOrRedirect } from "@/src/server/auth/guard";

// Merge the section into an existing /guide page, or use this as that page.
// BugGuide supplies id="report-a-bug"; do not wrap it in a duplicate anchor.
export default async function GuidePage() {
  await requireActorOrRedirect();
  return <BugGuide />;
}
