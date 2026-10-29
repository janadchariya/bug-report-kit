const imageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export interface ReportFiles {
  image: File | null;
  pdf: File | null;
}

export type ReportFileTransfer = Pick<DataTransfer, "items" | "files">;

export function usesCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

export function captureShortcut(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): string {
  if (/Mac|iPhone|iPad/.test(userAgent)) return "⌘⇧4";
  if (/Win/.test(userAgent)) return "⊞⇧S";
  return "เครื่องมือแคปหน้าจอ";
}

export function isImageFile(file: Blob): boolean {
  return imageTypes.has(file.type);
}

/** Clipboard text stays text; only actual files can become report attachments. */
export function routeReportFiles(transfer: ReportFileTransfer | null): ReportFiles {
  const result: ReportFiles = { image: null, pdf: null };
  if (!transfer) return result;

  function take(file: File | null) {
    if (!file) return;
    if (!result.image && isImageFile(file)) result.image = file;
    else if (!result.pdf && isPdfFile(file)) result.pdf = file;
  }

  for (const item of Array.from(transfer.items ?? [])) {
    if (item.kind === "file") take(item.getAsFile());
  }
  for (const file of Array.from(transfer.files ?? [])) take(file);
  return result;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  if (target.closest("input, textarea, select")) return true;
  const editable = target.closest("[contenteditable]");
  return editable !== null && editable.getAttribute("contenteditable")?.toLowerCase() !== "false";
}

/** Selection checks only; the server validates PDF bytes and active content. */
export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name));
}
export function pdfSelectionError(file: File): string | null {
  if (!isPdfFile(file)) return "แนบได้เฉพาะไฟล์ PDF";
  if (file.size === 0) return "ไฟล์ PDF ว่างเปล่า กรุณาเลือกไฟล์ใหม่";
  if (file.size > 4 * 1024 * 1024) return "ไฟล์ PDF ต้องมีขนาดไม่เกิน 4 MiB";
  return null;
}

/** A refused invalid/access request needs correction; uncertain/quota requests replay exactly. */
export function canRetryPdfFailure(result: { code: string; reasonCode?: string | null }): boolean {
  return result.code === "internal_error" || /quota|rate/.test(result.reasonCode ?? "");
}
