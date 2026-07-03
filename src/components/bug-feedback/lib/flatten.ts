import { drawShapes, type Shape } from "./shapes";

/**
 * Composite the screenshot + annotation shapes onto a single canvas, then
 * return a PNG Blob ready for upload. Shape coordinates are in the
 * screenshot's pixel space (we pass the same canvas through to the
 * annotation layer at native resolution).
 */
export async function flattenToPng(opts: {
  screenshot: HTMLCanvasElement;
  shapes: Shape[];
}): Promise<Blob> {
  const out = document.createElement("canvas");
  out.width = opts.screenshot.width;
  out.height = opts.screenshot.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.drawImage(opts.screenshot, 0, 0);
  drawShapes(ctx, opts.shapes);
  return await new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}
