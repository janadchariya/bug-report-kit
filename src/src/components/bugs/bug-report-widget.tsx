"use client";

import { Bug, Check } from "lucide-react";
import { startTransition, useEffect, useRef, useState } from "react";
import { attachBugPdfAction, createBugAction } from "@/app/actions/bugs";
import { canRetryPdfFailure } from "@/src/lib/bugs/report-dialog";
import { sanitizeBugLocation } from "@/src/lib/bugs/context";
import { resolveAnnotationColors } from "@/src/lib/bugs/annotation";
import { exportAnnotatedImage } from "@/src/lib/bugs/prepare-image";
import { Button } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/ui/dialog";
import { showToast } from "@/src/components/ui/toaster";
import { FloatingActionLayer } from "@/src/components/shell/floating-action-layer";
import { useRefreshNavCounts } from "@/src/components/shell/nav-badges";
import { BugCoachmark, dismissBugCoachmark } from "./bug-coachmark";
import { BugReportForm, type BugReportDraft } from "./bug-report-form";
import { bugPdfForm, retainBugPdf } from "./bug-pdf";
import "./bug-widget.css";

const emptyDraft = (): BugReportDraft => ({ summary: "", description: "", image: null, shapes: [], pdf: null });

/** Shell-owned memory draft survives RSC updates and uncertain action responses. */
export function BugReportWidget({ canReportBugs }: { canReportBugs: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const summary = useRef<HTMLInputElement>(null);
  const attempt = useRef<{ form: FormData; draft: BugReportDraft } | null>(null);
  const submitting = useRef(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BugReportDraft>(emptyDraft);
  const [pending, setPending] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refreshCounts = useRefreshNavCounts();
  useEffect(() => { if (open) summary.current?.focus(); }, [open]);
  useEffect(() => () => { if (successTimer.current) clearTimeout(successTimer.current); }, []);

  function close() {
    if (submitting.current) return;
    if ((draft.summary || draft.description || draft.image || draft.pdf || draft.shapes.length || imageBusy) && !window.confirm("ต้องการทิ้งข้อความ ภาพ ไฟล์ PDF และการวาดในรายงานนี้หรือไม่?")) return;
    setDraft(emptyDraft()); attempt.current = null; setError(null); setNotice(null); setImageBusy(false); setOpen(false);
    // The shared layer first becomes visible again after the dialog DOM is removed.
    setTimeout(() => trigger.current?.focus(), 0);
  }
  function submit() {
    if (submitting.current || imageBusy || !draft.image || !draft.summary.trim() || draft.summary.length > 200 || draft.description.length > 4000) return;
    submitting.current = true; setPending(true); setError(null); setNotice(null);
    const current = draft;
    startTransition(async () => {
      try {
        if (!attempt.current) {
          // Flatten only on Send; the original local raster and all shapes stay editable on failure.
          let blob: Blob;
          try { blob = await exportAnnotatedImage(current.image!, current.shapes, resolveAnnotationColors(summary.current ?? document.documentElement)); }
          catch (failure) { setError(failure instanceof Error ? failure.message : "บันทึกรูปไม่ได้ กรุณาลองอีกครั้ง"); return; }
          const location = sanitizeBugLocation({ pathname: window.location.pathname, query: window.location.search });
          const form = new FormData();
          form.set("requestId", crypto.randomUUID()); form.set("summary", current.summary.trim()); form.set("description", current.description.trim());
          form.set("pathname", location.path); form.set("query", location.query ?? "");
          form.set("viewportWidth", String(Math.max(1, Math.min(16_384, Math.round(window.innerWidth)))));
          form.set("viewportHeight", String(Math.max(1, Math.min(16_384, Math.round(window.innerHeight)))));
          form.set("image", blob, blob.type === "image/png" ? "screenshot.png" : "screenshot.webp");
          attempt.current = { form, draft: current };
        }
        const submitted = attempt.current;
        const result = await createBugAction(submitted.form);
        if (!result.ok) {
          // A known refusal did not save; corrected inputs may start a new attempt.
          // Internal/transport failures can follow a commit, so keep their exact retry.
          if (result.code !== "internal_error") attempt.current = null;
          setError(result.code === "forbidden" || result.code === "unauthenticated" ? "ไม่สามารถส่งรายงานด้วยสิทธิ์ปัจจุบันได้ กรุณาตรวจสอบการเข้าสู่ระบบ" : result.reasonCode === "bug_image_quota_exceeded" ? "ใช้โควตาแนบไฟล์ครบ 50 MiB ใน 24 ชั่วโมงแล้ว" : result.reasonCode?.includes("rate") ? "ส่งรายงานถี่เกินไป กรุณารอสักครู่แล้วลองส่งอีกครั้ง" : "ส่งรายงานไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองส่งอีกครั้ง");
          return;
        }
        // The report is now saved. PDF bytes always use a second request; a
        // refusal or lost response must never replay report creation.
        let pdfFailed = false;
        if (submitted.draft.pdf) {
          const upload = { bugId: result.data.id, requestId: crypto.randomUUID(), file: submitted.draft.pdf };
          try { const attached = await attachBugPdfAction(bugPdfForm(upload)); pdfFailed = !attached.ok; if (!attached.ok && canRetryPdfFailure(attached)) retainBugPdf(upload); }
          catch { pdfFailed = true; retainBugPdf(upload); }
        }
        attempt.current = null;
        const changed = current.summary !== submitted.draft.summary || current.description !== submitted.draft.description || current.image !== submitted.draft.image || current.shapes !== submitted.draft.shapes || current.pdf !== submitted.draft.pdf;
        if (changed) setNotice("บันทึกรายงานก่อนหน้าแล้ว ข้อมูลที่แก้ไขยังอยู่ สามารถส่งเป็นรายงานใหม่ได้");
        else { setDraft(emptyDraft()); setImageBusy(false); setOpen(false); }
        setSent(true);
        if (successTimer.current) clearTimeout(successTimer.current);
        successTimer.current = setTimeout(() => setSent(false), 1500);
        refreshCounts(); showToast({ text: pdfFailed ? "บันทึกรายงานแล้ว แต่แนบ PDF ไม่สำเร็จ เปิดรายงานเพื่อลองอีกครั้ง" : "บันทึกรายงานแล้ว", href: `/bugs/mine/${result.data.id}` });
        if (!changed) setTimeout(() => trigger.current?.focus(), 0);
      } catch { setError("ยังยืนยันผลการส่งไม่ได้ ข้อมูลยังอยู่ กรุณาลองส่งอีกครั้ง"); }
      finally { submitting.current = false; setPending(false); }
    });
  }
  if (!canReportBugs) return null;
  return <>
    <FloatingActionLayer>
      <BugCoachmark hidden={open || sent} />
      <Button ref={trigger} className="bug-report-trigger" variant="primary" aria-label="Report a bug" title="Report a bug" data-sent={sent} onClick={() => { dismissBugCoachmark(); setOpen(true); }}>
        {sent ? <Check size={26} aria-hidden="true" /> : <Bug size={26} aria-hidden="true" />}
      </Button>
    </FloatingActionLayer>
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }} title="Report a bug" className="ui-dialog bug-report-dialog" returnFocusRef={trigger} dismissible={!pending}>
      <BugReportForm summaryRef={summary} draft={draft} onChange={setDraft} pending={pending} imageBusy={imageBusy} onBusyChange={setImageBusy} error={error} notice={notice} onSubmit={submit} onCancel={close} />
    </Dialog>
  </>;
}
