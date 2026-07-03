import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getMyBugs } from "@/lib/bugs/get-my-bugs";

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่",
  in_progress: "กำลังดำเนินการ",
  done: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

export default async function MyBugsPage() {
  const user = await getCurrentUser();
  const bugs = await getMyBugs({ userId: user.id, companyId: user.companyId });

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Bug ของฉัน</h1>
      {bugs.length === 0 && (
        <p className="text-sm text-slate-500">ยังไม่มี bug ที่คุณรายงาน</p>
      )}
      <ul className="space-y-2">
        {bugs.map((bug) => (
          <li key={bug.id}>
            <Link
              href={`/my-bugs/${bug.id}`}
              className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-400"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {bug.hasUnreadReply && (
                    <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-red-500" />
                  )}
                  <span className="truncate text-sm font-medium text-slate-900">
                    {bug.summary}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {new Date(bug.createdAt).toLocaleDateString("th-TH")}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {STATUS_LABEL[bug.status] ?? bug.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
