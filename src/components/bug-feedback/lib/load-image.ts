export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export type LoadImageError = "not_image" | "too_large" | "decode_failed";

/**
 * Convert a pasted/dropped/selected image File or Blob into an HTMLCanvasElement
 * so it feeds the existing annotation-canvas which expects a canvas (same shape
 * as what captureBody() used to return).
 */
export async function fileToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  if (!ALLOWED.includes(file.type)) throw new Error("not_image");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("too_large");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode_failed"));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth);
    canvas.height = Math.round(img.naturalHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("decode_failed");
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Extract the first image File from a paste ClipboardEvent or drop DataTransfer.
 */
export function imageFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  for (const f of Array.from(dt.files ?? [])) {
    if (f.type.startsWith("image/")) return f;
  }
  return null;
}
