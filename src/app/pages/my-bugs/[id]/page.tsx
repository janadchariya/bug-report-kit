import { notFound } from "next/navigation";

import { BugCommentThread } from "@/components/admin/bugs/bug-comment-thread";
import { ReporterReadEffect } from "@/components/bugs/reporter-read-effect";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBugDetail } from "@/lib/bugs/get-bug";
import { prisma } from "@/lib/db/prisma";

const STATUS_LABEL: Record<string, string> = {
  new: "ใหม่",
  in_progress: "กำลังดำเนินการ",
  done: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

export default async function MyBugDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const detail = await getBugDetail(id);
  if (!detail || detail.bug.reporterId !== user.id) notFound();

  const authorIds = [...new Set(detail.comments.map((c) => c.authorId))];
  const authors = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, fullName: true },
  });
  const userLookup: Record<string, { fullName: string }> = Object.fromEntries(
    authors.map((a) => [a.id, { fullName: a.fullName }]),
  );
  userLookup[user.id] = { fullName: user.fullName };

  return (
    <section className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <ReporterReadEffect bugId={detail.bug.id} />
      <div>
        <h1 className="text-xl font-bold">{detail.bug.summary}</h1>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-slate-100 px-2 py-0.5">
            {STATUS_LABEL[detail.bug.status] ?? detail.bug.status}
          </span>
          <span>
            รายงาน{" "}
            {new Date(detail.bug.createdAt).toLocaleDateString("th-TH")}
          </span>
        </div>
        {detail.bug.description && (
          <p className="mt-3 text-sm text-slate-700">{detail.bug.description}</p>
        )}
      </div>

      <div>
        <h2 className="mb-1 text-sm font-semibold text-slate-700">
          การสื่อสารกับทีม
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          ช่องนี้ไว้สื่อสารกับทีม IT — คุณสามารถตอบกลับหรือส่งรูปเพิ่มเติมได้
        </p>
        <BugCommentThread
          bugId={detail.bug.id}
          initial={detail.comments}
          currentUserId={user.id}
          userLookup={userLookup}
        />
      </div>
    </section>
  );
}
