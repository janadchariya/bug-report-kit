"use client";

import { useEffect, useRef, useState } from "react";

import { AnnotationCanvas } from "./annotation-canvas";
import { AnnotationToolbar, type ToolKind } from "./annotation-toolbar";
import { BugForm } from "./bug-form";
import { fileToCanvas, imageFromDataTransfer } from "./lib/load-image";
import { flattenToPng } from "./lib/flatten";
import { captureShortcut } from "./lib/os-hint";
import type { Shape, ShapeColor } from "./lib/shapes";

export type AnnotationModalProps = {
  /** Pass null to start in the "attach image" state; pass a canvas to go
   *  straight to the annotation editor (used when a canvas is already known). */
  screenshot: HTMLCanvasElement | null;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (opts: {
    summary: string;
    description: string | null;
    pngBlob: Blob;
    width: number;
    height: number;
  }) => void;
};

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

export function AnnotationModal({
  screenshot: screenshotProp,
  submitting,
  error,
  onClose,
  onSubmit,
}: AnnotationModalProps) {
  const [tool, setTool] = useState<ToolKind>("rect");
  const [color, setColor] = useState<ShapeColor>("red");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [zoom, setZoom] = useState(1);

  // Local screenshot state — starts from the prop (which may be null when
  // arriving from the FAB in "attaching" mode).
  const [screenshot, setScreenshot] = useState<HTMLCanvasElement | null>(
    screenshotProp,
  );

  // Feedback inside the attach / annotate area.
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachSuccess, setAttachSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [draggingOver, setDraggingOver] = useState(false);

  const shortcut = captureShortcut();

  // ── helpers ────────────────────────────────────────────────────────────────

  async function loadFile(file: File | Blob | null) {
    if (!file) return;
    setAttachError(null);
    try {
      const canvas = await fileToCanvas(file);
      setScreenshot(canvas);
      setShapes([]);
      setZoom(1);
      setAttachSuccess(true);
      // Auto-fade success message after 3 s
      setTimeout(() => setAttachSuccess(false), 3000);
    } catch (err) {
      const msg =
        err instanceof Error && err.message === "too_large"
          ? "ไฟล์ใหญ่เกิน 15MB"
          : "รองรับเฉพาะรูปภาพ (PNG / JPG / WebP / GIF)";
      setAttachError(msg);
    }
  }

  // ── paste handler (window-level so it works while form is focused) ─────────
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      const file = imageFromDataTransfer(e.clipboardData);
      if (file) {
        e.preventDefault();
        await loadFile(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // ── keyboard shortcuts ─────────────────────────────────────────────────────
  function zoomIn() {
    setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100));
  }
  function zoomOut() {
    setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        attemptClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        setShapes((prev) => prev.slice(0, -1));
      }
      if (e.key === "+" || e.key === "=") zoomIn();
      if (e.key === "-") zoomOut();
      if (e.key === "0") setZoom(1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes.length]);

  function attemptClose() {
    if (submitting) return;
    if (shapes.length > 0) {
      if (!confirm("ยกเลิก? annotation ทั้งหมดจะหายไป")) return;
    }
    onClose();
  }

  async function handleSubmit(values: { summary: string; description: string | null }) {
    if (!screenshot) return; // guard — submit button should be disabled anyway
    const blob = await flattenToPng({ screenshot, shapes });
    onSubmit({
      ...values,
      pngBlob: blob,
      width: screenshot.width,
      height: screenshot.height,
    });
  }

  // ── drag-and-drop on the drop zone ────────────────────────────────────────
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDraggingOver(true);
  }
  function onDragLeave() {
    setDraggingOver(false);
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDraggingOver(false);
    const file = imageFromDataTransfer(e.dataTransfer);
    await loadFile(file);
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4"
      role="dialog"
      aria-modal
      aria-label="รายงานปัญหา"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold">รายงานปัญหา</h2>
          <button
            type="button"
            onClick={attemptClose}
            aria-label="ปิด"
            className="text-slate-500 hover:text-slate-900"
          >
            ✕
          </button>
        </div>

        {/* Toolbar — only when an image is attached */}
        {screenshot && (
          <AnnotationToolbar
            tool={tool}
            color={color}
            canUndo={shapes.length > 0}
            zoom={zoom}
            onToolChange={setTool}
            onColorChange={setColor}
            onUndo={() => setShapes((s) => s.slice(0, -1))}
            onReset={() => {
              if (shapes.length === 0) return;
              if (confirm("ล้าง annotation ทั้งหมด?")) setShapes([]);
            }}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onZoomReset={() => setZoom(1)}
          />
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_360px]">
          {/* Left pane — drop zone OR annotation canvas */}
          <div className="min-h-0 overflow-hidden bg-slate-100 p-2 relative">
            {screenshot ? (
              <>
                {/* "Image attached" success banner + change button */}
                {attachSuccess && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1 text-xs text-white shadow">
                    ✓ แนบภาพแล้ว — วาดทำเครื่องหมายได้
                  </div>
                )}
                <div className="absolute top-3 right-3 z-10">
                  <button
                    type="button"
                    onClick={() => {
                      setScreenshot(null);
                      setShapes([]);
                      setAttachSuccess(false);
                      setAttachError(null);
                    }}
                    className="rounded-md bg-white/80 px-2 py-1 text-xs text-slate-700 shadow hover:bg-white"
                  >
                    เปลี่ยนภาพ
                  </button>
                </div>
                <AnnotationCanvas
                  screenshot={screenshot}
                  tool={tool}
                  color={color}
                  shapes={shapes}
                  zoom={zoom}
                  onCommitShape={(s) => setShapes((prev) => [...prev, s])}
                />
              </>
            ) : (
              /* Drop zone */
              <div
                ref={dropZoneRef}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`flex h-full min-h-[320px] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed transition ${
                  draggingOver
                    ? "border-[#ff5300] bg-orange-50"
                    : "border-slate-300 bg-slate-50"
                }`}
              >
                {/* Icon */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-14 w-14 text-slate-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.2}
                  aria-hidden
                >
                  <rect x="3" y="3" width="18" height="14" rx="2" />
                  <circle cx="8" cy="8" r="1.5" />
                  <path d="M3 14l5-4 4 3 3-2 6 5" />
                </svg>

                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">
                    ลากภาพมาวาง หรือกด ⌘/Ctrl+V
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    แคปหน้าจอ: {shortcut} แล้ววางที่นี่
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  เลือกไฟล์ภาพ
                </button>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    loadFile(file);
                    // Reset so the same file can be re-selected
                    e.target.value = "";
                  }}
                />

                {attachError && (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                    {attachError}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right pane — form */}
          <div className="border-t md:border-l md:border-t-0 border-slate-200">
            <BugForm
              submitting={submitting}
              error={error}
              hasImage={!!screenshot}
              shortcut={shortcut}
              onSubmit={handleSubmit}
              onCancel={attemptClose}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
