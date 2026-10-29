"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { FileText } from "lucide-react";
import { attachBugPdfAction, removeBugPdfAction } from "@/app/actions/bugs";
import { useRefreshNavCounts } from "@/src/components/shell/nav-badges";
import { Button } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/ui/dialog";
import { canRetryPdfFailure, pdfSelectionError } from "@/src/lib/bugs/report-dialog";
import type { BugPdfMeta } from "@/src/lib/bugs/types";
import "./bug-pdf.css";

type PendingPdf = { bugId: string; commentId?: string; requestId: string; file: File };
// Memory only: never persist customer files to browser storage. Route navigation
// and RSC refresh retain the exact file/requestId; a full reload offers reselect.
const pendingPdfs = new Map<string, PendingPdf>();
const listeners = new Set<() => void>();
const keyOf = (bugId: string, commentId?: string) => `${bugId}:${commentId ?? "report"}`;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function changed() { for (const listener of listeners) listener(); }
export function retainBugPdf(pending: PendingPdf) {
  const key = keyOf(pending.bugId, pending.commentId);
  pendingPdfs.delete(key);
  pendingPdfs.set(key, pending);
  // Bound abandoned private drafts to at most 40 MiB in this tab.
  while (pendingPdfs.size > 10) pendingPdfs.delete(pendingPdfs.keys().next().value!);
  changed();
}
function forgetBugPdf(bugId: string, commentId?: string) { if (pendingPdfs.delete(keyOf(bugId, commentId))) changed(); }
export function bugPdfForm(pending: PendingPdf) {
  const form = new FormData();
  form.set("bugId", pending.bugId); form.set("requestId", pending.requestId); form.set("pdf", pending.file);
  if (pending.commentId) form.set("commentId", pending.commentId);
  return form;
}

export function BugPdfSlot({ bugId, commentId, pdf, snapshot, canRemove, canUpload, own = false, onUploaded }: {
  bugId: string; commentId?: string; pdf?: BugPdfMeta | null; snapshot: object; canRemove: boolean; canUpload: boolean; own?: boolean; onUploaded?: (pdf: BugPdfMeta) => void;
}) {
  const saved = useSyncExternalStore(subscribe, () => pendingPdfs.get(keyOf(bugId, commentId)) ?? null, () => null);
  const [local, setLocal] = useState<{ source: object; pdf: BugPdfMeta | null }>({ source: snapshot, pdf: null });
  const source = useRef(snapshot);
  source.current = snapshot;
  if (local.source !== snapshot) setLocal({ source: snapshot, pdf: null });
  const shown = pdf?.removed ? pdf : local.source === snapshot ? local.pdf ?? pdf : pdf;
  const [blocked, setBlocked] = useState<{ source: object; access: boolean } | null>(null);
  const isBlocked = blocked?.source === snapshot;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const picker = useRef<HTMLInputElement>(null);
  const refreshCounts = useRefreshNavCounts();
  useEffect(() => { if (pdf || !canUpload) forgetBugPdf(bugId, commentId); }, [pdf, bugId, commentId, canUpload]);
  function upload(file?: File) {
    if (pending || shown || !canUpload) return;
    const upload = saved ?? (file ? { bugId, commentId, requestId: crypto.randomUUID(), file } : null);
    if (!upload) return;
    const message = pdfSelectionError(upload.file);
    if (message) { setError(message); return; }
    retainBugPdf(upload); setError(null);
    const currentSource = snapshot;
    startTransition(async () => {
      try {
        const result = await attachBugPdfAction(bugPdfForm(upload));
        if (!result.ok) {
          if (source.current !== currentSource) return;
          if (!canRetryPdfFailure(result)) forgetBugPdf(bugId, commentId);
          if (result.code === "forbidden" || result.code === "unauthenticated" || result.reasonCode === "bug_not_visible" || result.reasonCode === "bug_pdf_already_attached" || result.reasonCode === "bug_pdf_not_pending") {
            const access = result.code === "forbidden" || result.code === "unauthenticated" || result.reasonCode === "bug_not_visible";
            setBlocked({ source: currentSource, access });
            setError(access ? "ไม่สามารถแนบ PDF ด้วยสิทธิ์ปัจจุบันได้ กรุณาตรวจสอบการเข้าสู่ระบบ" : "แนบ PDF ไม่สำเร็จ กรุณาโหลดข้อมูลล่าสุดเพื่อตรวจสอบไฟล์ที่แนบแล้ว");
          } else setError(canRetryPdfFailure(result) ? "แนบ PDF ไม่สำเร็จ กรุณาลองอีกครั้ง" : "แนบ PDF ไม่สำเร็จ กรุณาเลือกไฟล์ใหม่ที่ไม่มีคำสั่งหรือไฟล์ฝังอยู่");
          return;
        }
        forgetBugPdf(bugId, commentId);
        if (source.current === currentSource) { setLocal({ source: currentSource, pdf: result.data }); onUploaded?.(result.data); }
        refreshCounts();
      } catch { if (source.current === currentSource) setError("แนบ PDF ไม่สำเร็จ กรุณาลองอีกครั้ง"); }
    });
  }
  function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || !shown || !reason.trim()) return;
    const currentSource = snapshot;
    setError(null);
    startTransition(async () => {
      try {
        const result = await removeBugPdfAction({ fileId: shown.id, reason: reason.trim() });
        if (!result.ok) { setError("นำ PDF ออกไม่สำเร็จ กรุณาลองอีกครั้ง"); return; }
        forgetBugPdf(bugId, commentId);
        if (source.current === currentSource) setLocal({ source: currentSource, pdf: result.data });
        setOpen(false); setReason(""); refreshCounts();
      } catch { setError("ยังยืนยันผลไม่ได้ กรุณาลองอีกครั้ง"); }
    });
  }
  if (!shown && !canUpload) return null;
  const expected = shown ? `/api/bugs/files/${shown.id}` : "";
  const privatePdf = shown && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shown.id) && shown.url === expected;
  return <div className="bugs-pdf" data-refresh-managed="" data-refresh-hold={pending ? "" : undefined}>
    {shown ? shown.removed ? <p className="bugs-pdf__removed">PDF removed</p> : privatePdf ? <a className={`bugs-pdf__download${commentId ? " bugs-pdf__download--comment" : ""}${commentId && own ? " bugs-pdf__download--own" : ""}`} href={expected} download={shown.fileName} title={shown.fileName}><FileText aria-hidden="true" />{commentId ? <span>ไฟล์ PDF — กดเพื่อดาวน์โหลด</span> : <span><span>{shown.fileName}</span><span>ไฟล์ PDF — กดเพื่อดาวน์โหลด</span></span>}</a> : <p className="bugs-helper">ไม่สามารถดาวน์โหลดไฟล์นี้ได้</p> : isBlocked ? <>{blocked.access ? null : <a href={canRemove ? `/bugs/${bugId}` : `/bugs/mine/${bugId}`}>Reload report</a>}</> : <>
      {saved ? <><p className="bugs-pdf__error" role="alert">{error ?? "แนบ PDF ไม่สำเร็จ"} — {saved.file.name}</p><Button size="sm" onClick={() => upload()} disabled={pending}>{pending ? "Uploading…" : "Retry PDF upload"}</Button></> : <>
        {commentId && !error ? <p className="bugs-pdf__error" role="alert">แนบ PDF ไม่สำเร็จ กรุณาเลือกไฟล์ PDF เพื่อลองอีกครั้ง</p> : null}
        <input ref={picker} type="file" accept="application/pdf,.pdf" aria-label="Choose PDF attachment" hidden disabled={pending} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) upload(file); }} />
        <Button size="sm" onClick={() => picker.current?.click()} disabled={pending}>{pending ? "Uploading…" : "Attach PDF"}</Button>
      </>}
    </>}
    {canRemove && shown && !shown.removed ? <Button size="sm" onClick={() => { setOpen(true); setError(null); }}>Remove PDF</Button> : null}
    {error && !open && (!saved || shown) ? <p role="alert" className="bugs-pdf__error">{error}</p> : null}
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }} dismissible={!pending} title="Remove PDF" description="ไฟล์จะถูกนำออกอย่างถาวรจากรายงานนี้ ประวัติการนำออกจะยังอยู่">
      <form onSubmit={remove} className="bugs-form"><label>Removal reason<textarea required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} /></label>
        {error ? <p role="alert">{error}</p> : null}<div className="bugs-actions"><Button onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button type="submit" variant="critical" disabled={pending || !reason.trim()}>Confirm removal</Button></div>
      </form>
    </Dialog>
  </div>;
}
