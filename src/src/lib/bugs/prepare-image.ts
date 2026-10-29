import { BUG_IMAGE_MAX_BYTES, BUG_IMAGE_MAX_EDGE } from "@/src/domain/bugs";
import { drawShapes, type AnnotationColors, type AnnotationShape } from "./annotation";

export const BUG_IMAGE_INPUT_MAX_BYTES = 15 * 1024 * 1024;
const inputTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function canvas(width: number, height: number): HTMLCanvasElement {
  const result = document.createElement("canvas");
  result.width = width;
  result.height = height;
  return result;
}

function context(source: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = source.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้ไม่รองรับการเตรียมรูป กรุณาลองเบราว์เซอร์อื่น");
  return ctx;
}

/** Local originals never leave the browser. Annotation always uses this bounded raster. */
export async function prepareImage(input: Blob, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  if (!input.size || input.size > BUG_IMAGE_INPUT_MAX_BYTES) throw new Error("กรุณาเลือกรูปขนาดไม่เกิน 15 MiB");
  if (!inputTypes.has(input.type)) throw new Error("กรุณาเลือกรูป PNG, JPEG, WebP หรือ GIF");
  if (signal?.aborted) throw new DOMException("ยกเลิกการเตรียมรูป", "AbortError");
  const url = URL.createObjectURL(input);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const decoded = new Image();
      function cleanup() { decoded.onload = null; decoded.onerror = null; signal?.removeEventListener("abort", abort); }
      function abort() { cleanup(); decoded.src = ""; reject(new DOMException("ยกเลิกการเตรียมรูป", "AbortError")); }
      decoded.onload = () => { cleanup(); resolve(decoded); };
      decoded.onerror = () => { cleanup(); reject(new Error("เปิดรูปไม่ได้ กรุณาเลือกรูปใหม่")); };
      signal?.addEventListener("abort", abort, { once: true });
      decoded.src = url;
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error("เปิดรูปไม่ได้ กรุณาเลือกรูปใหม่");
    const scale = Math.min(1, BUG_IMAGE_MAX_EDGE / Math.max(width, height));
    const result = canvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    // Rasterise immediately on load: animated GIF input becomes its first still frame.
    context(result).drawImage(image, 0, 0, result.width, result.height);
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(source: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    try { source.toBlob(resolve, mime, quality); } catch (error) { reject(error); }
  });
}

/** The result is the only image passed to report/comment FormData. Attempts are finite. */
export async function exportAnnotatedImage(source: HTMLCanvasElement, shapes: readonly AnnotationShape[] = [], colors?: AnnotationColors): Promise<Blob> {
  if (source.width < 1 || source.height < 1) throw new Error("บันทึกรูปไม่ได้ กรุณาลองอีกครั้ง");
  const composed = canvas(source.width, source.height);
  const ctx = context(composed);
  ctx.drawImage(source, 0, 0);
  if (shapes.length) {
    if (!colors || Object.values(colors).some((color) => !color)) throw new Error("บันทึกรูปไม่ได้ กรุณาลองอีกครั้ง");
    drawShapes(ctx, shapes, colors);
  }
  const initialScale = Math.min(1, BUG_IMAGE_MAX_EDGE / Math.max(source.width, source.height));
  let webpSupported = true;
  for (const resize of [1, 0.8, 0.6, 0.4]) {
    const scaled = canvas(Math.max(1, Math.round(source.width * initialScale * resize)), Math.max(1, Math.round(source.height * initialScale * resize)));
    context(scaled).drawImage(composed, 0, 0, scaled.width, scaled.height);
    if (webpSupported) {
      for (const quality of [0.9, 0.75, 0.55]) {
        const blob = await encode(scaled, "image/webp", quality);
        if (!blob || blob.type !== "image/webp") { webpSupported = false; break; }
        if (blob.size > 0 && blob.size <= BUG_IMAGE_MAX_BYTES) return blob;
      }
    }
    if (!webpSupported) {
      const blob = await encode(scaled, "image/png");
      if (!blob || blob.type !== "image/png" || blob.size === 0) throw new Error("บันทึกรูปไม่ได้ กรุณาลองอีกครั้ง");
      if (blob.size <= BUG_IMAGE_MAX_BYTES) return blob;
    }
  }
  throw new Error("ลดขนาดรูปให้ไม่เกิน 2 MiB ไม่ได้ กรุณาเลือกรูปที่เล็กลง โดยแบบร่างเดิมยังอยู่");
}
