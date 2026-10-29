"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { Camera, FileText, X } from "lucide-react";
import { addBugCommentAction, attachBugPdfAction, loadBugThreadAction, removeBugImageAction } from "@/app/actions/bugs";
import { useRefreshNavCounts } from "@/src/components/shell/nav-badges";
import { Avatar } from "@/src/components/ui/avatar";
import { exportAnnotatedImage, prepareImage } from "@/src/lib/bugs/prepare-image";
import { Button } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/ui/dialog";
import type { BugComment, BugImageMeta, BugStaff } from "@/src/lib/bugs/types";
import { formatBangkokDateTime } from "@/src/lib/locale-time";
import { canRetryPdfFailure, isPdfFile, pdfSelectionError } from "@/src/lib/bugs/report-dialog";
import { BugPdfSlot, bugPdfForm, retainBugPdf } from "./bug-pdf";
import { BugImageViewer } from "./bug-image-viewer";
import "./bug-comment-thread.css";

export function BugAttachment({ image, canRemove }: { image: BugImageMeta; canRemove: boolean }) {
  const [removed, setRemoved] = useState<BugImageMeta | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const refreshCounts = useRefreshNavCounts();
  const shown = image.removed ? image : removed ?? image;
  function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !reason.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await removeBugImageAction({ imageId: image.id, reason: reason.trim() });
        if (!result.ok) { setError("ลบรูปไม่สำเร็จ กรุณาลองอีกครั้ง"); return; }
        setRemoved(result.data); setOpen(false); setReason(""); refreshCounts();
      } catch { setError("ยังยืนยันผลไม่ได้ กรุณาลองอีกครั้ง"); }
    });
  }
  const expected = `/api/bugs/images/${shown.id}`;
  const privateImage = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shown.id) && shown.url === expected;
  return <div className="bugs-attachment">
    {shown.kind === "screenshot" ? <BugImageViewer image={shown} /> : shown.removed ? <p className="bug-image__removed">Image removed</p> : privateImage ?
      <a href={expected} target="_blank" rel="noreferrer" className="bugs-comment__image-link">
        {/* Private images must bypass Next's image optimiser and its shared cache. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={expected} alt="Comment attachment" width={shown.width} height={shown.height} className="bugs-comment__image" />
      </a> : <p className="bugs-helper">ไม่สามารถแสดงรูปนี้ได้</p>}

    {canRemove && !shown.removed ? <Button size="sm" onClick={() => { setOpen(true); setError(null); }}>Remove image</Button> : null}
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }} dismissible={!pending} title="Remove image" description="รูปจะถูกนำออกอย่างถาวรจากรายงานนี้ ประวัติการนำออกจะยังอยู่">
      <form onSubmit={remove} className="bugs-form">
        <label>Removal reason<textarea required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} /></label>
        {error ? <p role="alert">{error}</p> : null}
        <div className="bugs-actions"><Button onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button type="submit" variant="critical" disabled={pending || !reason.trim()}>Confirm removal</Button></div>
      </form>
    </Dialog>
  </div>;
}

export function BugCommentThread({ bugId, scope, initial, commentsBefore, staff = [] }: { bugId: string; scope: "mine" | "triage"; initial: BugComment[]; commentsBefore: string | null; staff?: BugStaff[] }) {
  const [pages, setPages] = useState(() => ({
    source: { initial, commentsBefore, bugId, scope },
    older: [] as BugComment[], sent: [] as BugComment[], before: commentsBefore,
    loading: false, error: null as string | null,
  }));
  // A fresh server window is authoritative even if its IDs/cursor are unchanged:
  // omitted older/local rows may have been privacy-scrubbed or had images removed.
  // Reset only the retained pages, keeping the independent unsent draft intact.
  if (pages.source.initial !== initial || pages.source.commentsBefore !== commentsBefore || pages.source.bugId !== bugId || pages.source.scope !== scope) {
    setPages({ source: { initial, commentsBefore, bugId, scope }, older: [], sent: [], before: commentsBefore, loading: false, error: null });
  }
  const { older, sent, before, loading, error: olderError } = pages;
  const [body, setBody] = useState("");
  const [image, setImage] = useState<Blob | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLImageElement>(null);
  const operation = useRef(0);
  const preparing = useRef(false);
  const imageAbort = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();
  const [attempt, setAttempt] = useState<{ requestId: string; body: string; image: Blob | null; pdf: File | null; pdfRequestId: string } | null>(null);
  const refreshCounts = useRefreshNavCounts();
  useEffect(() => {
    if (!image || !preview.current) return;
    const element = preview.current;
    const url = URL.createObjectURL(image);
    element.src = url;
    return () => { element.removeAttribute("src"); URL.revokeObjectURL(url); };
  }, [image]);
  useEffect(() => () => { operation.current += 1; imageAbort.current?.abort(); }, []);
  async function pickImage(file: File) {
    if (sending || preparing.current) return;
    if (isPdfFile(file)) {
      const message = pdfSelectionError(file); setError(message);
      if (!message) { setPdf(file); setImage(null); }
      return;
    }
    const token = ++operation.current;
    const controller = new AbortController();
    imageAbort.current = controller;
    preparing.current = true; setImageBusy(true); setError(null);
    try {
      const source = await prepareImage(file, controller.signal);
      if (operation.current !== token) return;
      const blob = await exportAnnotatedImage(source);
      if (operation.current === token) { setImage(blob); setPdf(null); }
    } catch (failure) {
      if (operation.current === token) setError(failure instanceof Error ? failure.message : "เปิดรูปไม่ได้ กรุณาเลือกรูปใหม่");
    } finally {
      if (operation.current === token) { preparing.current = false; imageAbort.current = null; setImageBusy(false); }
    }
  }
  const comments = useMemo(() => {
    // A revalidated initial window may overlap loaded pages or a successful replay.
    const byId = new Map([...older, ...initial].map((comment) => [comment.id, comment]));
    // Local action results fill IDs absent from the server window only. In
    // particular, a later server tombstone must replace a sent image copy.
    for (const comment of sent) if (!byId.has(comment.id)) byId.set(comment.id, comment);
    // Keep the server's precise ordering for events sharing a JS millisecond.
    return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [older, sent, initial]);
  const names = new Map(staff.map((user) => [user.id, user.nickname ?? user.displayName]));
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || imageBusy || preparing.current || (!attempt && !body.trim() && !image && !pdf)) return;
    // An uncertain response may already have committed. Retry the identical payload;
    // edits made meanwhile are a separate draft and survive a successful replay.
    const submitted = attempt ?? { requestId: crypto.randomUUID(), body, image, pdf, pdfRequestId: crypto.randomUUID() };
    const source = pages.source;
    setAttempt(submitted);
    const form = new FormData();
    form.set("bugId", bugId); form.set("requestId", submitted.requestId); form.set("body", submitted.body.trim());
    if (submitted.image) form.set("image", submitted.image, submitted.image.type === "image/png" ? "comment.png" : "comment.webp");
    if (submitted.pdf) form.set("pendingPdf", "true");
    setError(null);
    startSend(async () => {
      try {
        const result = await addBugCommentAction(form);
        if (!result.ok) {
          if (result.code !== "internal_error") setAttempt(null);
          setError(result.reasonCode === "bug_rate_limited" ? "ส่งข้อความถี่เกินไป กรุณารอสักครู่แล้วลองอีกครั้ง"
            : result.reasonCode === "bug_image_quota_exceeded" ? "ใช้โควตาแนบไฟล์ครบ 50 MiB ใน 24 ชั่วโมงแล้ว"
            : "ส่งข้อความไม่สำเร็จ ข้อความและรูปยังอยู่ กรุณาลองอีกครั้ง"); return;
        }
        let finalComment = result.data.comment;
        if (submitted.pdf && !finalComment.pdf) {
          const upload = { bugId, commentId: finalComment.id, requestId: submitted.pdfRequestId, file: submitted.pdf };
          try {
            const attached = await attachBugPdfAction(bugPdfForm(upload));
            if (attached.ok) finalComment = { ...finalComment, pdf: attached.data, pendingPdf: false };
            else { if (canRetryPdfFailure(attached)) retainBugPdf(upload); finalComment = { ...finalComment, pendingPdf: true }; }
          } catch { retainBugPdf(upload); finalComment = { ...finalComment, pendingPdf: true }; }
        }
        setPages((previous) => previous.source === source ? { ...previous, sent: [...previous.sent, finalComment] } : previous);
        setBody((current) => current === submitted.body ? "" : current);
        if (image === submitted.image) { setImage(null); if (picker.current) picker.current.value = ""; }
        if (pdf === submitted.pdf) setPdf(null);
        setAttempt(null);
        refreshCounts();
      } catch { setError("ยังไม่แน่ใจว่าส่งสำเร็จหรือไม่ ข้อความและรูปยังอยู่ กดส่งอีกครั้งได้เลย"); }
    });
  }
  async function loadOlder() {
    if (!before || loading) return;
    const source = pages.source;
    setPages((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const result = await loadBugThreadAction({ bugId, scope, commentsBefore: before });
      // Responses from a superseded window must never restore stale text/images,
      // its pagination cursor, or an error over a newly refreshed thread.
      setPages((previous) => previous.source !== source ? previous : result.ok
        ? { ...previous, older: [...result.data.comments, ...previous.older], before: result.data.commentsBefore, loading: false }
        : { ...previous, loading: false, error: "โหลดข้อความก่อนหน้าไม่สำเร็จ กรุณาลองอีกครั้ง" });
    } catch {
      setPages((previous) => previous.source === source ? { ...previous, loading: false, error: "โหลดข้อความก่อนหน้าไม่สำเร็จ กรุณาลองอีกครั้ง" } : previous);
    }
  }
  return <section className="bugs-thread" aria-label="Discussion">
    {before ? <Button onClick={loadOlder} disabled={loading}>Load older comments</Button> : null}
    {olderError ? <p role="alert">{olderError}</p> : null}
    <ol aria-label="Comments" className="bugs-thread__items">{comments.map((comment) => {
      const author = (comment.authorUserId ? names.get(comment.authorUserId) : undefined) ?? (comment.isMine ? "You" : "Team member");
      return <li key={comment.id} className={comment.isMine ? "bugs-comment bugs-comment--own" : "bugs-comment"}>
        <Avatar name={author} size="sm" />
        <div className="bugs-comment__content">
          <div className="bugs-comment__meta"><span>{author} · <time dateTime={comment.createdAt}>{formatBangkokDateTime(new Date(comment.createdAt))}</time></span></div>
          <div className="bugs-comment__bubble">
            {comment.body ? <p className="bugs-user-text">{comment.body}</p> : comment.image ? <p className="bugs-comment__attachment-label">(Image)</p> : comment.pdf || comment.pendingPdf ? <p className="bugs-comment__attachment-label">(PDF)</p> : null}
            {comment.image ? <BugAttachment key={comment.image.id} image={comment.image} canRemove={scope === "triage"} /> : null}
            {comment.pdf || comment.pendingPdf ? <BugPdfSlot bugId={bugId} commentId={comment.id} pdf={comment.pdf} own={comment.isMine} snapshot={comment} canRemove={scope === "triage"} canUpload={comment.isMine && !!comment.pendingPdf} /> : null}
            {comment.pendingPdf && !comment.pdf && !comment.isMine ? <p className="bugs-helper">ผู้ส่งยังแนบ PDF ไม่สำเร็จ</p> : null}
          </div>
        </div>
      </li>;
    })}</ol>
    {!comments.length ? <p className="bugs-helper">ยังไม่มีข้อความตอบกลับ</p> : null}
    <form onSubmit={send} className="bugs-composer" data-refresh-managed data-refresh-hold={body || image || pdf || imageBusy || sending || attempt ? "" : undefined}
      onPaste={(event) => {
        if (sending || preparing.current) return;
        for (const item of Array.from(event.clipboardData.items ?? [])) {
          if (item.kind !== "file") continue;
          const file = item.getAsFile();
          if (!file || !isPdfFile(file) && !/^image\/(png|jpeg|webp)$/.test(file.type)) continue;
          if (file) { event.preventDefault(); void pickImage(file); }
          return;
        }
      }}>
      {image ? <div className="bugs-composer__preview">
        {/* Memory-only image drafts must use their browser Blob URL directly. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={preview} alt="Attached image preview" />
        <button type="button" aria-label="Remove attachment" className="bugs-composer__remove" disabled={sending || imageBusy} onClick={() => { setImage(null); setError(null); if (picker.current) picker.current.value = ""; }}><span className="bugs-composer__remove-dot"><X aria-hidden="true" /></span></button>
      </div> : null}
      {pdf ? <div className="bugs-composer__pdf bug-pdf-chip"><FileText aria-hidden="true" /><span>{pdf.name}</span><button type="button" aria-label="Remove attachment" className="bugs-composer__remove" disabled={sending || imageBusy} onClick={() => { setPdf(null); setError(null); if (picker.current) picker.current.value = ""; }}><span className="bugs-composer__remove-dot"><X aria-hidden="true" /></span></button></div> : null}
      <textarea aria-label="Comment" maxLength={4000} rows={2} value={body} onChange={(event) => setBody(event.target.value)} disabled={sending} placeholder="พิมพ์ข้อความ… (วางรูปหรือไฟล์ PDF ด้วย ⌘/Ctrl+V ได้)" />
      {attempt && (attempt.body !== body || attempt.image !== image || attempt.pdf !== pdf) ? <p className="bugs-helper">การลองอีกครั้งจะยืนยันข้อความที่ส่งครั้งก่อน ข้อความที่แก้ไขจะยังอยู่สำหรับส่งครั้งถัดไป</p> : null}
      <div className="bugs-composer__actions">
        <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" aria-label="Choose comment image" hidden disabled={sending || imageBusy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void pickImage(file); }} />
        <button type="button" aria-label="Attach image or PDF" title="Attach image or PDF (PNG, JPG, WebP, PDF)" className="bugs-composer__camera" disabled={sending || imageBusy} onClick={() => picker.current?.click()}><Camera aria-hidden="true" /></button>
        {imageBusy ? <p role="status" className="bugs-helper">กำลังเตรียมรูป…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        <Button type="submit" variant="primary" size="sm" disabled={sending || imageBusy || (!attempt && !body.trim() && !image && !pdf)}>{sending ? "Sending…" : "Send"}</Button>
      </div>
    </form>
  </section>;
}
