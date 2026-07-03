import { redirect } from "next/navigation";

import { BugsSplitView } from "@/components/admin/bugs/bugs-split-view";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { mapBugReport } from "@/lib/bugs/mappers";

export default async function AdminBugsPage() {
  const user = await getCurrentUser();
  if (user.role !== "ADMIN") redirect("/dashboard");

  const [rows, companies, assignables] = await Promise.all([
    prisma.bugReport.findMany({
      take: 101,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        reporter: { select: { id: true, fullName: true, email: true, companyId: true } },
        company: { select: { id: true, name: true } },
      },
    }),
    prisma.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, role: true, companyId: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const hasMore = rows.length > 100;
  const items = rows.slice(0, 100).map((r) => ({
    ...mapBugReport(r),
    reporter: r.reporter,
    company: r.company,
  }));

  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-bold">Bug Reports</h1>
      <BugsSplitView
        initial={{ items, nextCursor: hasMore ? items[items.length - 1].id : null }}
        companies={companies}
        assignables={assignables}
        currentUserId={user.id}
      />
    </section>
  );
}
