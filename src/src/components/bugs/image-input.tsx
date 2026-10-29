"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import type { AnnotationShape } from "@/src/lib/bugs/annotation";
import { exportAnnotatedImage, prepareImage } from "@/src/lib/bugs/prepare-image";
import { AnnotationEditor } from "./annotation-editor";
import "./bug-images.css";

function imageFile(transfer: DataTransfer | null): File | null {
  if (!transfer) return null;
  for (const file of Array.from(transfer.files ?? [])) if (file.type.startsWith("image/")) return file;
  for (const item of Array.from(transfer.items ?? [])) if (item.kind === "file" && item.type.startsWith("image/")) { const file = item.getAsFile(); if (file) return file; }
  return null;
}

function isFileDrag(transfer: DataTransfer | null): boolean {
  return Array.from(transfer?.types ?? []).includes("Files");
}

/** Report screenshots and comment attachments share this exact preparation path. */
export function ImageInput({ value, onChange, disabled = false, onBusyChange, onEditingChange }: {
  value: Blob | null; onChange: (blob: Blob | null) => void; disabled?: boolean;
  onBusyChange?: (busy: boolean) => void; onEditingChange?: (editing: boolean) => void;
}) {
  const inputId = useId();
  const picker = useRef<HTMLInputElement>(null);
  const annotateButton = useRef<HTMLButtonElement>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preview = useRef<HTMLImageElement>(null);
  const operation = useRef(0);
  const sourceAbort = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const callbacks = useRef({ onChange, onBusyChange, onEditingChange });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ source: HTMLCanvasElement; ownerValue: Blob | null } | null>(null);
  const [shapes, setShapes] = useState<AnnotationShape[]>([]);
  const appliedShapes = useRef<AnnotationShape[]>([]);
  const source = draft?.ownerValue === value ? draft.source : null;

  useEffect(() => { callbacks.current = { onChange, onBusyChange, onEditingChange }; }, [onChange, onBusyChange, onEditingChange]);

  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => { if (isFileDrag(event.dataTransfer)) event.preventDefault(); };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, []);

  useEffect(() => {
    if (!value || editing || !preview.current) return;
    const img = preview.current;
    const url = URL.createObjectURL(value);
    img.src = url;
    return () => { img.removeAttribute("src"); URL.revokeObjectURL(url); };
  }, [value, editing]);
  useEffect(() => () => { operation.current += 1; sourceAbort.current?.abort(); if (focusTimer.current) clearTimeout(focusTimer.current); }, []);

  function changeBusy(next: boolean) { pending.current = next; setBusy(next); callbacks.current.onBusyChange?.(next); }
  function changeEditing(next: boolean) { setEditing(next); callbacks.current.onEditingChange?.(next); }
  function finishEditing() { changeEditing(false); focusTimer.current = setTimeout(() => annotateButton.current?.focus(), 0); }

  async function load(file: Blob, annotateExisting = false) {
    if (disabled || pending.current) return;
    const token = ++operation.current;
    const controller = new AbortController(); sourceAbort.current = controller;
    changeBusy(true); setError(null);
    try {
      const prepared = await prepareImage(file, controller.signal);
      if (operation.current !== token) return;
      if (annotateExisting) {
        setDraft({ source: prepared, ownerValue: value }); setShapes([]); appliedShapes.current = [];
        changeEditing(true); return;
      }
      const blob = await exportAnnotatedImage(prepared);
      if (operation.current !== token) return;
      setDraft({ source: prepared, ownerValue: blob }); setShapes([]); appliedShapes.current = [];
      callbacks.current.onChange(blob);
    } catch (failure) {
      if (operation.current === token) setError(failure instanceof Error ? failure.message : "เปิดรูปไม่ได้ กรุณาเลือกรูปใหม่");
    } finally { if (operation.current === token) { sourceAbort.current = null; changeBusy(false); } }
  }

  return <div className="bug-image-input" role="region" aria-label="Image attachment" tabIndex={disabled ? -1 : 0} aria-busy={busy}
    onPaste={(event) => { if (disabled || busy) return; const file = imageFile(event.clipboardData); if (file) { event.preventDefault(); void load(file); } }}
    onDragOver={(event) => { if (isFileDrag(event.dataTransfer)) event.preventDefault(); }}
    onDrop={(event) => { if (isFileDrag(event.dataTransfer)) event.preventDefault(); if (disabled || busy) return; const file = imageFile(event.dataTransfer); if (file) void load(file); }}>
    <input ref={picker} id={inputId} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Attach image" className="bug-image-input__picker" disabled={disabled || busy || editing} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void load(file); }} />
    {editing && source ? <AnnotationEditor source={source} shapes={shapes} onShapesChange={setShapes} disabled={disabled} onBusyChange={changeBusy}
      onApply={(blob) => { appliedShapes.current = [...shapes]; setDraft({ source, ownerValue: blob }); callbacks.current.onChange(blob); finishEditing(); }}
      onCancel={() => { setShapes([...appliedShapes.current]); finishEditing(); }} /> : <>
      {value ? <div className="bug-image-input__preview">{/* A private memory-only preview must use its browser Blob URL directly. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={preview} alt="Attached image preview" />
      </div> : null}
      <p className="bug-image__hint">แคปหน้าจอแล้ววางในช่องนี้ ลากรูปมาวาง หรือเลือกไฟล์ PNG, JPEG, WebP ไม่เกิน 15 MiB ตรวจข้อมูลส่วนตัวก่อนแนบ รูปจะถูกย่อและบันทึกไม่เกิน 2 MiB</p>
      <div className="bug-image__actions">
        <Button disabled={disabled || busy} onClick={() => picker.current?.click()}>Attach image</Button>
        {source || value ? <Button ref={annotateButton} disabled={disabled || busy} onClick={() => { if (source) changeEditing(true); else if (value) void load(value, true); }}>Annotate</Button> : null}
        {source || value ? <Button disabled={disabled || busy} onClick={() => { operation.current += 1; setDraft(null); setShapes([]); appliedShapes.current = []; setError(null); changeEditing(false); onChange(null); }}>Remove image</Button> : null}
      </div>
      {busy ? <p role="status" className="bug-image__hint">กำลังเตรียมรูป…</p> : null}
      {error ? <p role="alert" className="bug-image__error">{error}</p> : null}
    </>}
  </div>;
}
