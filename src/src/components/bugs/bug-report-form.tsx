"use client";

import { FileText, Image as ImageIcon, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { Button } from "@/src/components/ui/button";
import type { AnnotationShape, AnnotationTool, ShapeColor } from "@/src/lib/bugs/annotation";
import { prepareImage } from "@/src/lib/bugs/prepare-image";
import { captureShortcut, isImageFile, isTypingTarget, pdfSelectionError, routeReportFiles, usesCoarsePointer } from "@/src/lib/bugs/report-dialog";
import { AnnotationToolbar } from "./annotation-toolbar";
import { AnnotationCanvas } from "./annotation-canvas";
import "./bug-images.css";
import "./bug-pdf.css";

export interface BugReportDraft {
  summary: string;
  description: string;
  image: HTMLCanvasElement | null;
  shapes: AnnotationShape[];
  pdf?: File | null;
}

export function BugReportForm({ draft, onChange, pending, imageBusy, onBusyChange, error, notice, onSubmit, onCancel, summaryRef }: {
  draft: BugReportDraft;
  onChange: (draft: BugReportDraft) => void;
  pending: boolean;
  imageBusy: boolean;
  onBusyChange: (busy: boolean) => void;
  error: string | null;
  notice?: string | null;
  onSubmit: () => void;
  onCancel: () => void;
  summaryRef: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  const picker = useRef<HTMLInputElement>(null);
  const chooseImage = useRef<HTMLButtonElement>(null);
  const changeImage = useRef<HTMLButtonElement>(null);
  const restoreImageFocus = useRef(false);
  const pdfPicker = useRef<HTMLInputElement>(null);
  const operation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const loading = useRef(false);
  const callbacks = useRef({ draft, onChange, onBusyChange, pending });
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDescription, setShowDescription] = useState(!!draft.description);
  const [tool, setTool] = useState<AnnotationTool | null>(() => usesCoarsePointer() ? null : "rect");
  const [color, setColor] = useState<ShapeColor>("red");
  const [zoom, setZoom] = useState(1);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [attachSuccess, setAttachSuccess] = useState(false);
  const [dragging, setDragging] = useState(false);
  const shortcut = captureShortcut();
  const valid = !!draft.image && draft.summary.trim().length > 0 && draft.summary.length <= 200 && draft.description.length <= 4000;

  useEffect(() => { callbacks.current = { draft, onChange, onBusyChange, pending }; }, [draft, onChange, onBusyChange, pending]);
  useEffect(() => {
    if (!restoreImageFocus.current || imageBusy) return;
    const control = draft.image ? changeImage.current : chooseImage.current;
    if (control && !control.disabled) {
      control.focus({ preventScroll: true });
      restoreImageFocus.current = false;
    }
  }, [draft.image, imageBusy]);
  useEffect(() => () => {
    operation.current += 1;
    abort.current?.abort();
    if (successTimer.current) clearTimeout(successTimer.current);
  }, []);

  useEffect(() => {
    async function load(file: File) {
      if (callbacks.current.pending || loading.current) return;
      if (!isImageFile(file)) { setAttachError("รองรับเฉพาะรูปภาพ (PNG / JPG / WebP / GIF)"); return; }
      const token = ++operation.current;
      const controller = new AbortController();
      abort.current = controller; loading.current = true;
      callbacks.current.onBusyChange(true); setAttachError(null);
      try {
        const image = await prepareImage(file, controller.signal);
        if (operation.current !== token) return;
        const current = callbacks.current;
        restoreImageFocus.current = true;
        current.onChange({ ...current.draft, image, shapes: [] });
        setTool(usesCoarsePointer() ? null : "rect"); setZoom(1); setAttachSuccess(true);
        if (successTimer.current) clearTimeout(successTimer.current);
        successTimer.current = setTimeout(() => setAttachSuccess(false), 3000);
      } catch (failure) {
        if (operation.current === token) setAttachError(failure instanceof Error ? failure.message : "เปิดรูปไม่ได้ กรุณาเลือกรูปใหม่");
      } finally {
        if (operation.current === token) {
          abort.current = null; loading.current = false; callbacks.current.onBusyChange(false);
        }
      }
    }
    function route(transfer: DataTransfer | null) {
      if (callbacks.current.pending || loading.current) return false;
      const files = routeReportFiles(transfer);
      const imageCandidates = [...Array.from(transfer?.files ?? []), ...Array.from(transfer?.items ?? []).filter((item) => item.kind === "file").map((item) => item.getAsFile())];
      const unsupportedImage = !files.image && imageCandidates.some((file) => file && (file.type.startsWith("image/") || /\.(heic|heif|svg|bmp)$/i.test(file.name)));
      if (unsupportedImage) setAttachError("รองรับเฉพาะรูปภาพ (PNG / JPG / WebP / GIF)");
      if (files.image) void load(files.image);
      if (files.pdf) {
        const message = pdfSelectionError(files.pdf);
        setPdfError(message);
        if (!message) { const current = callbacks.current; current.onChange({ ...current.draft, pdf: files.pdf }); }
      }
      return !!(files.image || files.pdf || unsupportedImage);
    }
    function paste(event: ClipboardEvent) { if (route(event.clipboardData)) event.preventDefault(); }
    function guard(event: DragEvent) {
      if (event.type === "drop") setDragging(false);
      const files = Array.from(event.dataTransfer?.types ?? []).includes("Files");
      if (!files) return;
      event.preventDefault();
      const inside = event.target instanceof Element && !!event.target.closest(".bug-report-dialog");
      if (event.type === "drop") {
        if (inside) route(event.dataTransfer);
      } else setDragging(inside);
    }
    function leave(event: DragEvent) { if (event.relatedTarget == null) setDragging(false); }
    function end() { setDragging(false); }
    function pick(event: Event) {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0]; input.value = "";
      if (file) void load(file);
    }
    const input = picker.current;
    input?.addEventListener("change", pick);
    window.addEventListener("paste", paste);
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragend", end);
    return () => {
      input?.removeEventListener("change", pick);
      window.removeEventListener("paste", paste);
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragend", end);
    };
  }, []);

  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (pending || imageBusy || !draft.image || isTypingTarget(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault(); onChange({ ...draft, shapes: draft.shapes.slice(0, -1) });
      } else if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.key === "+" || event.key === "=") { event.preventDefault(); setZoom((z) => Math.min(3, z + 0.25)); }
        else if (event.key === "-") { event.preventDefault(); setZoom((z) => Math.max(0.5, z - 0.25)); }
        else if (event.key === "0") { event.preventDefault(); setZoom(1); }
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [draft, onChange, pending, imageBusy]);

  function submit(event: FormEvent) { event.preventDefault(); if (valid && !pending && !imageBusy) onSubmit(); }
  return <form className="bug-report-composer" onSubmit={submit} aria-busy={pending}>
    {draft.image ? <><AnnotationToolbar tool={tool} color={color} canUndo={draft.shapes.length > 0} zoom={zoom} disabled={pending || imageBusy}
      onToolChange={setTool} onColorChange={setColor} onUndo={() => onChange({ ...draft, shapes: draft.shapes.slice(0, -1) })}
      onClear={() => onChange({ ...draft, shapes: [] })} onZoomChange={setZoom} />
      {usesCoarsePointer() ? <p className="bug-report-image__hint">เลือกเครื่องมือแล้วลากเพื่อทำเครื่องหมาย กดเครื่องมือที่เลือกซ้ำเพื่อเลื่อนภาพ</p> : null}</> : null}
    <div className="bug-report-composer__columns">
      <div className="bug-report-image" onDragLeave={() => setDragging(false)}>
        <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Choose image" className="bug-image-input__picker" disabled={pending || imageBusy} />
        {draft.image ? <>
          {attachSuccess ? <div role="status" className="bug-report-image__success">✓ แนบภาพแล้ว — วาดทำเครื่องหมายได้</div> : null}
          <Button ref={changeImage} className="bug-report-image__change" disabled={pending || imageBusy} onClick={() => {
            restoreImageFocus.current = true;
            onChange({ ...draft, image: null, shapes: [] }); setTool(usesCoarsePointer() ? null : "rect"); setAttachSuccess(false); setAttachError(null); setZoom(1);
          }}>Change image</Button>
          <AnnotationCanvas screenshot={draft.image} tool={tool} color={color} shapes={draft.shapes} zoom={zoom} disabled={pending || imageBusy}
            onCommitShape={(shape) => onChange({ ...draft, shapes: [...draft.shapes, shape] })} />
        </> : <div className="bug-report-dropzone" data-dragging={dragging}>
          <ImageIcon size={56} strokeWidth={1.2} aria-hidden="true" />
          <div><p className="bug-report-dropzone__title">ลากภาพมาวาง หรือกด ⌘/Ctrl+V</p><p>แคปหน้าจอ: {shortcut} แล้ววางที่นี่</p></div>
          <Button ref={chooseImage} disabled={pending || imageBusy} onClick={() => picker.current?.click()}>Choose image</Button>
        </div>}
        {imageBusy ? <p role="status" className="bug-report-image__hint">กำลังเตรียมรูป…</p> : null}
        {attachError ? <p role="alert" className="bug-report-form__error">{attachError}</p> : null}
      </div>
      <div className="bug-report-form">
        <div className="bug-report-field">
          <label htmlFor={`${id}-summary`} className="bug-report-field__label"><span id={`${id}-summary-label`}>Summary</span> <span className="bug-report-field__required" aria-hidden="true">*</span></label>
          <input ref={summaryRef} id={`${id}-summary`} className="ui-input" required maxLength={200} placeholder="เช่น ปุ่ม Save กดไม่ได้"
            aria-labelledby={`${id}-summary-label`} aria-describedby={`${id}-summary-count`} value={draft.summary} disabled={pending} onChange={(event) => onChange({ ...draft, summary: event.target.value })} />
          <span id={`${id}-summary-count`} className="bug-report-form__hint">{draft.summary.length}/200</span>
        </div>
        {!showDescription ? <button type="button" className="bug-report-details-toggle" disabled={pending} onClick={() => setShowDescription(true)}>+ Add details</button> :
          <div className="bug-report-field">
            <label htmlFor={`${id}-description`}>Description</label>
            <textarea id={`${id}-description`} className="ui-input" rows={4} maxLength={4000} aria-describedby={`${id}-description-count`}
              value={draft.description} disabled={pending} onChange={(event) => onChange({ ...draft, description: event.target.value })} />
            <span id={`${id}-description-count`} className="bug-report-form__hint">{draft.description.length}/4000</span>
          </div>}
        <div className="bug-report-pdf"><span>PDF attachment (optional)</span>
          <input ref={pdfPicker} type="file" accept="application/pdf,.pdf" aria-label="Choose PDF" hidden disabled={pending} onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
            const message = pdfSelectionError(file); setPdfError(message); if (!message) onChange({ ...draft, pdf: file });
          }} />
          {draft.pdf ? <div className="bug-pdf-chip"><FileText size={16} aria-hidden="true" /><span>{draft.pdf.name}</span><button type="button" aria-label="Remove PDF" disabled={pending} onClick={() => { onChange({ ...draft, pdf: null }); setPdfError(null); }}><X size={16} aria-hidden="true" /></button></div> : <Button size="sm" disabled={pending} onClick={() => pdfPicker.current?.click()}>Attach PDF</Button>}
          {pdfError ? <p className="bug-report-form__error" role="alert">{pdfError}</p> : null}
        </div>
        <p className="bug-report-form__hint">{draft.pdf ? "ภาพหน้าจอและไฟล์ PDF จะถูกส่งไปยังทีมงานเพื่อใช้แก้ปัญหา ตรวจสอบข้อมูลลูกค้าและข้อมูลส่วนตัวก่อนส่ง" : "ภาพหน้าจอจะถูกส่งไปยังทีมงานเพื่อใช้แก้ปัญหา ตรวจสอบข้อมูลลูกค้าและข้อมูลส่วนตัวในภาพก่อนส่ง"}</p>
        {!draft.image ? <p className="bug-report-form__nudge">ยังไม่มีภาพ — แคปด้วย {shortcut} แล้ววางตรงนี้ (⌘/Ctrl+V)</p> : null}
        {error ? <p className="bug-report-form__error" role="alert">{error}</p> : null}
        {notice ? <p className="bug-report-form__hint" role="status">{notice}</p> : null}
        <div className="bug-report-form__actions">
          <Button onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!valid || pending || imageBusy}>{pending ? "Sending…" : "Send"}</Button>
        </div>
      </div>
    </div>
  </form>;
}
