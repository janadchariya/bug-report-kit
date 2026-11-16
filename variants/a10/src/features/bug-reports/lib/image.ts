// Screenshot input and output for the bug button (bug-report-kit components/bug-feedback/lib: load-image, flatten,
// os-hint). The image goes to A10 in one request, and the host accepts 4.5 MB per request, so the flattened image is
// kept under MAX_BUG_IMAGE_BYTES: PNG when it fits, else WebP or JPEG, else scaled down. The canvas work runs in the
// browser; the size rules are pure and tested.
import { MAX_BUG_IMAGE_BYTES } from "@/domain/bug-reports";
import { drawShapes, type Shape } from "./shapes";

export const MAX_INPUT_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");
const ROUNDS = 6;

/** The encodings tried in each round: PNG first (sharpest), then lossy ones; later rounds only lossy. */
export function encodingsFor(round: number): [type: string, quality?: number][] {
  return round === 0
    ? [["image/png"], ["image/webp", 0.92], ["image/jpeg", 0.88]]
    : [["image/webp", 0.88], ["image/jpeg", 0.85]];
}

/** How much to shrink the sides when the smallest encoding was `smallest` bytes: by the area ratio, kept in 0.3..0.9. */
export function shrinkFactor(smallest: number, maxBytes = MAX_BUG_IMAGE_BYTES): number {
  return Math.max(0.3, Math.min(0.9, Math.sqrt(maxBytes / smallest) * 0.95));
}

/** Whether a picked or pasted file can be sent in a thread as it is (else it is re-encoded under the limit). */
export const sendsAsIs = (file: { type: string; size: number }, maxBytes = MAX_BUG_IMAGE_BYTES) =>
  file.size <= maxBytes && file.type !== "image/gif" && ACCEPTED_IMAGE_TYPES.includes(file.type);

/** The image error to show for a file that could not be read. */
export const attachErrorText = (code: string) =>
  code === "too_large" ? "The image is larger than 15 MB." : "Use an image: PNG, JPG, WebP or GIF.";

/** A pasted, dropped or chosen image as a canvas at its native size. Errors: 'not_image' | 'too_large' | 'decode_failed'. */
export async function fileToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error("not_image");
  if (file.size > MAX_INPUT_BYTES) throw new Error("too_large");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("decode_failed"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth);
    canvas.height = Math.round(img.naturalHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width || !canvas.height) throw new Error("decode_failed");
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The first image file of a paste or drop. */
export function imageFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  for (const file of Array.from(dt.files ?? [])) if (file.type.startsWith("image/")) return file;
  return null;
}

/** The screenshot shortcut of this computer, for the hints. */
export function captureShortcut(userAgent: string | null): string {
  if (!userAgent) return "your screenshot tool";
  if (/Mac|iPhone|iPad/.test(userAgent)) return "⌘⇧4";
  if (/Win/.test(userAgent)) return "⊞⇧S";
  return "your screenshot tool";
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

function scaled(source: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(source.width * factor));
  out.height = Math.max(1, Math.round(source.height * factor));
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

export type EncodedImage = { blob: Blob; width: number; height: number };

/** An image of at most maxBytes: PNG if it fits, then WebP, then JPEG, then smaller sizes. */
export async function encodeForUpload(canvas: HTMLCanvasElement, maxBytes = MAX_BUG_IMAGE_BYTES): Promise<EncodedImage> {
  let current = canvas;
  for (let round = 0; round < ROUNDS; round++) {
    let smallest: Blob | null = null;
    for (const [type, quality] of encodingsFor(round)) {
      const blob = await toBlob(current, type, quality);
      // A browser without WebP output answers PNG for 'image/webp': skip it.
      if (!blob || blob.type !== type) continue;
      if (blob.size <= maxBytes) return { blob, width: current.width, height: current.height };
      if (!smallest || blob.size < smallest.size) smallest = blob;
    }
    if (!smallest) throw new Error("This browser could not encode the screenshot");
    current = scaled(current, shrinkFactor(smallest.size, maxBytes));
  }
  throw new Error("The screenshot is too large to send. Crop it and try again.");
}

/** The screenshot with its annotations drawn in, ready to upload (kit flatten.ts). */
export async function flattenForUpload(screenshot: HTMLCanvasElement, shapes: Shape[]): Promise<EncodedImage> {
  const out = document.createElement("canvas");
  out.width = screenshot.width;
  out.height = screenshot.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.drawImage(screenshot, 0, 0);
  drawShapes(ctx, shapes);
  return encodeForUpload(out);
}

/** The file extension the server will store for an encoded image. */
export const imageExtension = (type: string) => (type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png");
