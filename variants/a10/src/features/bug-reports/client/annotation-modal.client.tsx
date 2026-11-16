"use client";

// "Report a problem" (bug-report-kit annotation-modal.tsx, annotation-toolbar.tsx, bug-form.tsx; old PR #2
// AnnotationModal.tsx). The person pastes (⌘/Ctrl+V), drops or picks a screenshot, marks it with boxes, circles, arrows
// or a pen in three colours, writes a short summary and sends. The marks stay while the dialog is open, so a failed send
// can be retried.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "radix-ui";
import { ArrowUpRight, Circle, ImagePlus, Loader2, Minus, PenLine, Plus, RotateCcw, Square, Undo2, X } from "lucide-react";
import { ACCEPT_ATTRIBUTE, attachErrorText, captureShortcut, fileToCanvas, flattenForUpload, imageFromDataTransfer, type EncodedImage } from "../lib/image";
import { SHAPE_COLOR_HEX, type Shape, type ShapeColor } from "../lib/shapes";
import { AnnotationCanvas, type ToolKind } from "./annotation-canvas.client";

export type AnnotatedReport = { summary: string; description: string | null; image: EncodedImage };
type Props = { submitting: boolean; error: string | null; onClose: () => void; onSubmit: (report: AnnotatedReport) => void };

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const TOOLS: { kind: ToolKind; label: string; Icon: typeof Square }[] = [
  { kind: "rect", label: "Box", Icon: Square },
  { kind: "ellipse", label: "Circle", Icon: Circle },
  { kind: "arrow", label: "Arrow", Icon: ArrowUpRight },
  { kind: "path", label: "Pen", Icon: PenLine },
];
const COLORS: { color: ShapeColor; label: string }[] = [
  { color: "red", label: "Red" },
  { color: "yellow", label: "Yellow" },
  { color: "green", label: "Green" },
];
const zoomIn = (z: number) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100);
const zoomOut = (z: number) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100);

export function AnnotationModal({ submitting, error, onClose, onSubmit }: Props) {
  const [tool, setTool] = useState<ToolKind>("rect");
  const [color, setColor] = useState<ShapeColor>("red");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [zoom, setZoom] = useState(1);
  const [screenshot, setScreenshot] = useState<HTMLCanvasElement | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [shortcut] = useState(() => captureShortcut(typeof navigator === "undefined" ? null : navigator.userAgent));
  const busy = submitting || preparing;

  const loadFile = useCallback(async (file: File | Blob | null) => {
    if (!file) return;
    setAttachError(null);
    try {
      const canvas = await fileToCanvas(file);
      setScreenshot(canvas);
      setShapes([]);
      setZoom(1);
    } catch (err) {
      setAttachError(attachErrorText(err instanceof Error ? err.message : ""));
    }
  }, []);

  // Paste anywhere while the dialog is open, even with the summary field focused.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromDataTransfer(e.clipboardData);
      if (file) {
        e.preventDefault();
        void loadFile(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !typing) {
        e.preventDefault();
        setShapes((s) => s.slice(0, -1));
        return;
      }
      if (typing || !screenshot) return;
      if (e.key === "+" || e.key === "=") setZoom(zoomIn);
      else if (e.key === "-") setZoom(zoomOut);
      else if (e.key === "0") setZoom(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [screenshot]);

  function attemptClose() {
    if (busy) return;
    if ((shapes.length > 0 || summary.trim()) && !window.confirm("Discard this report? Your marks and text will be lost.")) return;
    onClose();
  }

  const summaryValid = summary.trim().length > 0 && summary.length <= 200;
  const canSubmit = summaryValid && !!screenshot && !busy;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !screenshot) return;
    setPreparing(true);
    try {
      const image = await flattenForUpload(screenshot, shapes);
      onSubmit({ summary: summary.trim(), description: description.trim() || null, image });
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "The screenshot could not be prepared.");
    } finally {
      setPreparing(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && attemptClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="bug-overlay" />
        <Dialog.Content
          className="bug-modal"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            attemptClose();
          }}
        >
          <header className="bug-modal-head">
            <Dialog.Title>Report a problem</Dialog.Title>
            <Dialog.Description>Add a screenshot, mark what is wrong and tell us in a sentence.</Dialog.Description>
            <button type="button" className="bug-icon bug-modal-close" aria-label="Close" disabled={busy} onClick={attemptClose}>
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          {screenshot && (
            <div className="bug-toolbar" role="toolbar" aria-label="Marking tools">
              <div className="bug-tool-group">
                {TOOLS.map(({ kind, label, Icon }) => (
                  <button key={kind} type="button" className="bug-tool" aria-pressed={tool === kind} title={label} onClick={() => setTool(kind)}>
                    <Icon size={14} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <span className="bug-tool-sep" />
              <div className="bug-tool-group">
                {COLORS.map((c) => (
                  <button
                    key={c.color}
                    type="button"
                    className="bug-swatch"
                    aria-pressed={color === c.color}
                    aria-label={`${c.label} marks`}
                    title={c.label}
                    style={{ background: SHAPE_COLOR_HEX[c.color] }}
                    onClick={() => setColor(c.color)}
                  />
                ))}
              </div>
              <span className="bug-tool-sep" />
              <button type="button" className="bug-tool" disabled={!shapes.length} title="Undo (⌘/Ctrl+Z)" onClick={() => setShapes((s) => s.slice(0, -1))}>
                <Undo2 size={14} />
                <span>Undo</span>
              </button>
              <button
                type="button"
                className="bug-tool"
                disabled={!shapes.length}
                title="Remove every mark"
                onClick={() => window.confirm("Remove every mark?") && setShapes([])}
              >
                <RotateCcw size={14} />
                <span>Clear</span>
              </button>
              <span className="bug-tool-sep" />
              <div className="bug-tool-group">
                <button type="button" className="bug-tool" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom(zoomOut)}>
                  <Minus size={14} />
                </button>
                <button type="button" className="bug-tool bug-zoom-value" title="Reset zoom (0)" onClick={() => setZoom(1)}>
                  {Math.round(zoom * 100)}%
                </button>
                <button type="button" className="bug-tool" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom(zoomIn)}>
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}
          <div className="bug-modal-body">
            <div className="bug-stage">
              {screenshot ? (
                <>
                  <button
                    type="button"
                    className="bug-change-image"
                    disabled={busy}
                    onClick={() => {
                      if (shapes.length && !window.confirm("Use another image? Your marks will be lost.")) return;
                      setScreenshot(null);
                      setShapes([]);
                      setAttachError(null);
                    }}
                  >
                    Change image
                  </button>
                  <AnnotationCanvas screenshot={screenshot} tool={tool} color={color} shapes={shapes} zoom={zoom} onCommitShape={(s) => setShapes((prev) => [...prev, s])} />
                </>
              ) : (
                <div
                  className="bug-drop"
                  data-over={dragging || undefined}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    void loadFile(imageFromDataTransfer(e.dataTransfer));
                  }}
                >
                  <ImagePlus size={40} strokeWidth={1.3} aria-hidden="true" />
                  <p className="bug-drop-title">Paste a screenshot (⌘/Ctrl+V) or drop it here</p>
                  <p className="bug-drop-hint">Take one with {shortcut}, then paste it here.</p>
                  <button type="button" className="bug-btn" onClick={() => fileInput.current?.click()}>
                    Choose an image
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept={ACCEPT_ATTRIBUTE}
                    className="bug-sr"
                    aria-label="Choose a screenshot"
                    onChange={(e) => {
                      void loadFile(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                  {attachError && (
                    <p className="bug-error" role="alert">
                      {attachError}
                    </p>
                  )}
                </div>
              )}
            </div>
            <form className="bug-form" onSubmit={submit}>
              <label className="bug-field">
                <span>
                  What went wrong? <em aria-hidden="true">*</em>
                </span>
                <input
                  autoFocus
                  type="text"
                  required
                  maxLength={200}
                  value={summary}
                  disabled={busy}
                  placeholder="e.g. Save does nothing on the task panel"
                  onChange={(e) => setSummary(e.target.value)}
                />
                <small>{summary.length}/200</small>
              </label>
              {showDescription ? (
                <label className="bug-field">
                  <span>More detail</span>
                  <textarea
                    rows={4}
                    maxLength={4000}
                    value={description}
                    disabled={busy}
                    placeholder="What you did, what you expected, what happened"
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <small>{description.length}/4000</small>
                </label>
              ) : (
                <button type="button" className="bug-link" onClick={() => setShowDescription(true)}>
                  + Add more detail
                </button>
              )}
              <p className="bug-note">The screenshot, this page&apos;s address and your browser details go to the A10 team.</p>
              {!screenshot && <p className="bug-hint">No screenshot yet: take one with {shortcut} and paste it (⌘/Ctrl+V).</p>}
              {screenshot && attachError && (
                <p className="bug-error" role="alert">
                  {attachError}
                </p>
              )}
              {error && (
                <p className="bug-error" role="alert">
                  {error}
                </p>
              )}
              <div className="bug-form-actions">
                <button type="button" className="bug-btn" data-variant="ghost" disabled={busy} onClick={attemptClose}>
                  Cancel
                </button>
                <button type="submit" className="bug-btn" data-variant="primary" disabled={!canSubmit}>
                  {busy ? (
                    <>
                      <Loader2 size={14} className="bug-spin" />
                      Sending…
                    </>
                  ) : (
                    "Send report"
                  )}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
