"use client";

import { useState, useTransition, type FormEvent } from "react";
import { MessageCircle } from "lucide-react";
import { updateBugAction } from "@/app/actions/bugs";
import { useRefreshNavCounts } from "@/src/components/shell/nav-badges";
import { Button } from "@/src/components/ui/button";
import { BUG_PRIORITIES, BUG_STATUSES, canTransitionBugStatus, type BugPriority, type BugStatus } from "@/src/domain/bugs";
import type { BugDetail as Detail, BugStaff } from "@/src/lib/bugs/types";
import { formatBangkokDate, formatBangkokDateTime } from "@/src/lib/locale-time";
import { BUG_PRIORITY_LABELS, BUG_STATUS_LABELS, BugPriorityBadge, BugStatusBadge } from "./bug-badges";
import { BugAttachment, BugCommentThread } from "./bug-comment-thread";
import { BugPdfSlot } from "./bug-pdf";
import { BugStatusHistory } from "./bug-status-history";
import { ReporterReadEffect } from "./reporter-read-effect";

function TriageEditor({ detail, triagers }: { detail: Detail; triagers: BugStaff[] }) {
  const assignedToUserId = detail.assignedToUserId ?? null;
  const serverAssignee = triagers.find((user) => user.id === assignedToUserId) ?? (detail.assignee?.id === assignedToUserId ? detail.assignee : null);
  const [status, setStatus] = useState(detail.status);
  const [priority, setPriority] = useState<BugPriority | null>(detail.priority);
  const [assignee, setAssignee] = useState(assignedToUserId);
  const [selectedAssignee, setSelectedAssignee] = useState<BugStaff | null>(serverAssignee);
  const [version, setVersion] = useState(detail.version);
  const [baselineStatus, setBaselineStatus] = useState(detail.status);
  const [baselinePriority, setBaselinePriority] = useState(detail.priority);
  const [baselineAssignee, setBaselineAssignee] = useState(assignedToUserId);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [pending, startTransition] = useTransition();
  const refreshCounts = useRefreshNavCounts();
  const dirty = status !== baselineStatus || priority !== baselinePriority || assignee !== baselineAssignee || Boolean(reason);
  // RSC refresh preserves client state. Adopt a current snapshot only when it
  // cannot replace a draft or a pending payload, and never roll back a saved version.
  if (!dirty && !pending && !stale && detail.version >= version &&
      (detail.version !== version || detail.status !== baselineStatus || detail.priority !== baselinePriority || assignedToUserId !== baselineAssignee)) {
    setStatus(detail.status); setPriority(detail.priority); setAssignee(assignedToUserId); setVersion(detail.version);
    setSelectedAssignee(serverAssignee);
    setBaselineStatus(detail.status); setBaselinePriority(detail.priority); setBaselineAssignee(assignedToUserId);
  }
  // Retain the draft's actual selected ID when availability changes after refresh.
  const historicalAssignee = assignee && !triagers.some((user) => user.id === assignee)
    ? detail.assignee?.id === assignee ? detail.assignee : selectedAssignee?.id === assignee ? selectedAssignee : { id: assignee, displayName: "Team member", nickname: null }
    : null;
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || stale) return;
    const cancellation = status !== baselineStatus && status === "cancelled";
    if (cancellation && !reason.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateBugAction({ bugId: detail.id, expectedVersion: version,
          patch: { status, priority, ...(assignee !== baselineAssignee ? { assignedToUserId: assignee } : {}) },
          ...(cancellation ? { reason: reason.trim() } : {}),
        });
        if (!result.ok) {
          if (result.code === "stale_state") { setStale(true); setError("มีผู้แก้ไขรายงานนี้แล้ว กรุณาโหลดข้อมูลล่าสุดและตรวจสอบก่อนบันทึกอีกครั้ง"); }
          else setError(result.reasonCode === "bug_assignee_unavailable" ? "ผู้รับผิดชอบไม่พร้อมรับงานแล้ว กรุณาเลือกใหม่หรือเลือก Unassigned" : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
          return;
        }
        setVersion(result.data.version); setBaselineStatus(result.data.status); setBaselinePriority(priority); setBaselineAssignee(assignee); setReason(""); refreshCounts();
      } catch { setError("ยังยืนยันผลไม่ได้ กรุณาโหลดข้อมูลล่าสุดก่อนลองอีกครั้ง"); setStale(true); }
    });
  }
  return <section className="bugs-detail-card bugs-triage" aria-label="Triage"><h3>Triage</h3><form onSubmit={save} className="bugs-form" data-refresh-managed="" data-refresh-hold={dirty || pending || stale ? "" : undefined}>
    <div className="bugs-triage-fields">
      <label>Status<select value={status} disabled={pending || stale} onChange={(event) => setStatus(event.target.value as BugStatus)}>{BUG_STATUSES.filter((value) => value === baselineStatus || canTransitionBugStatus(baselineStatus, value)).map((value) => <option key={value} value={value}>{BUG_STATUS_LABELS[value]}</option>)}</select></label>
      <label>Priority<select value={priority ?? ""} disabled={pending || stale} onChange={(event) => setPriority(event.target.value as BugPriority || null)}><option value="">No priority</option>{BUG_PRIORITIES.map((value) => <option key={value} value={value}>{BUG_PRIORITY_LABELS[value]}</option>)}</select></label>
      <label>Assignee<select value={assignee ?? ""} disabled={pending || stale} onChange={(event) => { const next = event.target.value || null; setAssignee(next); setSelectedAssignee(triagers.find((user) => user.id === next) ?? null); }}><option value="">Unassigned</option>{historicalAssignee ? <option value={historicalAssignee.id} disabled>{historicalAssignee.nickname ?? historicalAssignee.displayName} (unavailable)</option> : null}{triagers.map((user) => <option key={user.id} value={user.id}>{user.nickname ?? user.displayName}</option>)}</select></label>
    </div>
    {status === "cancelled" && status !== baselineStatus ? <label>Cancellation reason<textarea required maxLength={500} value={reason} disabled={pending || stale} onChange={(event) => setReason(event.target.value)} /></label> : null}
    {error ? <p role="alert">{error}</p> : null}
    {stale ? <a href={`/bugs/${detail.id}`}>Reload report</a> : null}
    <div className="bugs-actions"><Button type="submit" variant="primary" disabled={!dirty || pending || stale}>{pending ? "Saving…" : "Save changes"}</Button></div>
  </form></section>;
}

export function BugDetail({ detail, scope, triagers }: { detail: Detail; scope: "mine" | "triage"; triagers: BugStaff[] }) {
  const staff = [...triagers, ...(detail.reporter ? [detail.reporter] : []), ...(detail.assignee ? [detail.assignee] : [])];
  const canAttachPdf = detail.isOwner && (detail.status === "new" || detail.status === "in_progress") && !detail.pdf;
  if (scope === "mine") return <article className="bugs-detail bugs-detail--mine" aria-label="Bug report detail">
    <ReporterReadEffect bugId={detail.id} isOwner={detail.isOwner} seenActivitySeq={detail.seenActivitySeq} />
    <header className="page-header"><div><h1 className="page-title bugs-user-text">{detail.summary}</h1><div className="bugs-badges"><BugStatusBadge status={detail.status} /><span className="bugs-helper">รายงาน <time dateTime={detail.createdAt}>{formatBangkokDate(new Date(detail.createdAt))}</time></span></div>{detail.description ? <p className="bugs-user-text bugs-detail__description">{detail.description}</p> : null}</div></header>
    {detail.screenshot ? <section aria-label="Attached screenshot"><h2>Attached screenshot</h2><BugAttachment key={detail.screenshot.id} image={detail.screenshot} canRemove={false} /></section> : null}
    {detail.pdf || canAttachPdf ? <section className="bugs-detail-card" aria-label="Attached PDF"><h2>Attached PDF</h2><BugPdfSlot bugId={detail.id} pdf={detail.pdf} snapshot={detail} canRemove={false} canUpload={canAttachPdf} /></section> : null}
    <section className="bugs-conversation" aria-label="Conversation with the team"><h2>Conversation with the team</h2><p className="bugs-helper">ช่องนี้ไว้สื่อสารกับทีม — คุณสามารถตอบกลับหรือส่งรูป / ไฟล์ PDF เพิ่มเติมได้</p><BugCommentThread bugId={detail.id} scope={scope} initial={detail.comments} commentsBefore={detail.commentsBefore} staff={staff} /></section>
  </article>;
  const page = `${detail.pagePath}${detail.pageQuery ? `?${detail.pageQuery}` : ""}`;
  return <article className="bugs-detail" aria-label="Bug report detail">
    <ReporterReadEffect bugId={detail.id} isOwner={detail.isOwner} seenActivitySeq={detail.seenActivitySeq} />
    <header><h2 className="bugs-user-text">{detail.summary}</h2><div className="bugs-badges"><BugStatusBadge status={detail.status} /><BugPriorityBadge priority={detail.priority} /><time className="bugs-helper" dateTime={detail.createdAt}>{formatBangkokDateTime(new Date(detail.createdAt))}</time></div></header>
    {detail.screenshot ? <BugAttachment key={detail.screenshot.id} image={detail.screenshot} canRemove /> : null}
    {detail.pdf || canAttachPdf ? <section className="bugs-detail-card" aria-label="Attached PDF"><h3>Attached PDF</h3><BugPdfSlot bugId={detail.id} pdf={detail.pdf} snapshot={detail} canRemove canUpload={canAttachPdf} /></section> : null}
    {detail.description ? <section className="bugs-detail-card bugs-description" aria-label="Details"><h3>Details</h3><p className="bugs-user-text">{detail.description}</p></section> : null}
    <details className="bugs-context bugs-detail-card"><summary>Technical details</summary><dl>
      <dt>Reporter</dt><dd>{detail.reporter?.nickname ?? detail.reporter?.displayName ?? "—"}</dd>
      <dt>Page</dt><dd className="bugs-user-text"><a href={page} target="_blank" rel="noreferrer">{page}</a></dd>
      <dt>Browser</dt><dd>{[detail.browserName, detail.browserVersion].filter(Boolean).join(" ") || "—"}</dd>
      <dt>OS</dt><dd>{[detail.osName, detail.osVersion].filter(Boolean).join(" ") || "—"}</dd>
      <dt>Device</dt><dd>{detail.deviceType ?? "—"}</dd>
      <dt>Viewport</dt><dd>{detail.viewportWidth} × {detail.viewportHeight}</dd>
      <dt>Screenshot</dt><dd>{detail.screenshot ? `${detail.screenshot.width} × ${detail.screenshot.height}` : "—"}</dd>
      <dt>Build SHA</dt><dd>{detail.appBuildSha ? <a href={`https://github.com/example/host-app/commit/${encodeURIComponent(detail.appBuildSha)}`} target="_blank" rel="noreferrer">{detail.appBuildSha.slice(0, 7)}</a> : "—"}</dd>
      <dt>User Agent</dt><dd>{detail.userAgent ?? "—"}</dd>
    </dl></details>
    <TriageEditor detail={detail} triagers={triagers} />
    <BugStatusHistory bugId={detail.id} scope={scope} initial={detail.statusChanges} historyBefore={detail.historyBefore} staff={staff} />
    <section className="bugs-ask" aria-label="Ask the reporter"><header className="bugs-ask__heading"><span className="bugs-ask__icon"><MessageCircle aria-hidden="true" /></span><div><h3>Ask the reporter</h3><p className="bugs-helper">ถามผู้รายงานเพิ่มเติมเพื่อให้เข้าใจปัญหาได้ชัดเจนขึ้น</p></div></header><BugCommentThread bugId={detail.id} scope={scope} initial={detail.comments} commentsBefore={detail.commentsBefore} staff={staff} /></section>
  </article>;
}
