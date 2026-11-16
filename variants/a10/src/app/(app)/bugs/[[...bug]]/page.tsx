import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { parseBugSegments } from "@/domain/bug-reports";
import { BugsLoading } from "@/features/bug-reports/bugs-loading";
import { BugsPage } from "@/features/bug-reports/client/bugs-page.client";
import { PageTopbar } from "@/features/topbar/page-topbar";
import { getViewer } from "@/server/auth/get-viewer";
import { getBugReports } from "@/server/bugs/bug-reports";

type Props = Pick<PageProps<"/bugs/[[...bug]]">, "params">;

export default function BugReportsPage({ params }: Props) {
  return (
    <>
      <PageTopbar title="Bug reports" />
      <Suspense fallback={<BugsLoading />}>
        <BugReports params={params} />
      </Suspense>
    </>
  );
}

// /bugs, or /bugs/<id> with that report open. Before the migration is applied the service answers "not set up" and the
// page shows it. Any other service error is thrown on purpose: error.tsx in the parent folder shows the error state.
async function BugReports({ params }: Props) {
  const openId = parseBugSegments((await params).bug);
  if (openId === undefined) notFound();
  await connection();
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  return <BugsPage data={await getBugReports().openPage(viewer, openId)} openId={openId} />;
}
