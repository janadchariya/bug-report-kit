import { prisma } from "@/lib/db/prisma";
import { sendChatCard } from "@/lib/notifications/chat";
import { shouldSendChat } from "@/lib/notifications/notif-prefs";
import type { NotifPrefs } from "@/lib/store/types";
import type { BugReport } from "./types";

export async function notifyBugCreated(
  bug: BugReport,
  reporterName: string,
): Promise<void> {
  const webhookUrl = process.env.GOOGLE_CHAT_BUG_WEBHOOK_URL;
  if (!webhookUrl) return;
  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  void sendChatCard(webhookUrl, {
    title: "🐛 Bug Report ใหม่",
    subtitle: bug.summary,
    sections: [
      {
        fields: [
          { label: "ผู้รายงาน", value: reporterName },
          { label: "หน้าที่พบปัญหา", value: bug.pageUrl },
          { label: "สถานะ", value: "New" },
        ],
      },
      ...(bug.description
        ? [{ header: "รายละเอียด", text: bug.description }]
        : []),
    ],
    buttons: [
      {
        text: "เปิดดู Bug Report",
        url: `${appUrl}/admin/bugs/${bug.id}`,
      },
    ],
  });
}

/**
 * Notify the reporter via Google Chat when someone else comments on a bug they
 * reported, so they know to come back and reply (the sidebar "Bug ของฉัน" badge
 * only updates on next page load — this is the proactive push).
 *
 * Sends to the reporter's PERSONAL chat webhook (not the admin bug webhook),
 * respects their `bugComment` chat preference, and never pings the reporter for
 * their own comment. Safe to call inside `deferNotify` — errors are swallowed
 * by `sendChatCard`/the caller.
 */
export async function notifyReporterOnBugComment(opts: {
  bugReportId: string;
  commenterId: string;
  commenterName: string;
  commentBody: string;
}): Promise<void> {
  const bug = await prisma.bugReport.findUnique({
    where: { id: opts.bugReportId },
    select: {
      summary: true,
      reporterId: true,
      reporter: { select: { chatWebhookUrl: true, notifPrefs: true } },
    },
  });
  if (!bug) return;
  // Don't notify the reporter about their own reply.
  if (bug.reporterId === opts.commenterId) return;

  const webhookUrl = bug.reporter.chatWebhookUrl;
  if (!webhookUrl) return;
  const prefs = (bug.reporter.notifPrefs as NotifPrefs | null) ?? null;
  if (!shouldSendChat(prefs, "bugComment")) return;

  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const snippet =
    opts.commentBody.length > 300
      ? `${opts.commentBody.slice(0, 300)}…`
      : opts.commentBody;

  await sendChatCard(webhookUrl, {
    title: "💬 มีคอมเมนต์ใหม่ใน Bug ที่คุณแจ้ง",
    subtitle: bug.summary,
    sections: [
      { fields: [{ label: "จาก", value: opts.commenterName }] },
      { header: "คอมเมนต์", text: snippet },
    ],
    buttons: [
      {
        text: "เปิดดูและตอบกลับ",
        url: `${appUrl}/my-bugs/${opts.bugReportId}`,
      },
    ],
  });
}
