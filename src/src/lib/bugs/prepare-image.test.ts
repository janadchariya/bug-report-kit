import { BUG_IMAGE_MAX_BYTES } from "@/src/domain/bugs";
import { exportAnnotatedImage, prepareImage } from "./prepare-image";

let dimensions = { width: 4800, height: 2400 };
let contexts: Array<{ drawImage: ReturnType<typeof vi.fn>; scale: ReturnType<typeof vi.fn>; ellipse: ReturnType<typeof vi.fn>; lineTo: ReturnType<typeof vi.fn>; fill: ReturnType<typeof vi.fn> }>;
let encode: (mime: string, width: number, quality?: number) => Blob | null;

beforeEach(() => {
  dimensions = { width: 4800, height: 2400 };
  contexts = [];
  vi.stubGlobal("Image", class {
    naturalWidth = dimensions.width; naturalHeight = dimensions.height;
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); }
  });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:input"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const ctx = { drawImage: vi.fn(), scale: vi.fn(), save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), ellipse: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), closePath: vi.fn(), fill: vi.fn() };
    contexts.push(ctx); return ctx as unknown as CanvasRenderingContext2D;
  });
  encode = (mime) => new Blob(["encoded"], { type: mime });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback, mime, quality) { callback(encode(mime ?? "image/png", this.width, quality)); });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([{ width: 4800, height: 2400, expected: [1920, 960] }, { width: 600, height: 6000, expected: [192, 1920] }, { width: 1920, height: 1000, expected: [1920, 1000] }])("downscales $width × $height before annotation", async ({ width, height, expected }) => {
  dimensions = { width, height };
  const canvas = await prepareImage(new Blob(["source"], { type: "image/png" }));
  expect([canvas.width, canvas.height]).toEqual(expected);
  expect(contexts[0].drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, ...expected);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:input");
});

it("rejects the 15 MiB input guard before creating or decoding a source URL", async () => {
  await expect(prepareImage(new Blob([new Uint8Array(15 * 1024 * 1024 + 1)], { type: "image/png" }))).rejects.toThrow(/15 MiB/);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("decodes a GIF once into a still bounded raster and exports WebP", async () => {
  const source = await prepareImage(new Blob(["gif frames"], { type: "image/gif" }));
  expect([source.width, source.height]).toEqual([1920, 960]);
  expect(contexts[0].drawImage).toHaveBeenCalledTimes(1);
  const result = await exportAnnotatedImage(source);
  expect(result.type).toBe("image/webp");
  expect(result.size).toBeLessThanOrEqual(BUG_IMAGE_MAX_BYTES);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:input");
});

it("still rejects non-raster inputs without creating a source URL", async () => {
  await expect(prepareImage(new Blob(["svg"], { type: "image/svg+xml" }))).rejects.toThrow(/PNG/);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("refuses an invalid decode and cleans its URL", async () => {
  vi.stubGlobal("Image", class { onerror: (() => void) | null = null; set src(value: string) { if (value) queueMicrotask(() => this.onerror?.()); } });
  await expect(prepareImage(new Blob(["bad"], { type: "image/png" }))).rejects.toThrow(/เปิดรูป/);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:input");
});

it("releases an in-progress decode URL when its input/editor is closed", async () => {
  vi.stubGlobal("Image", class { set src(_value: string) { /* Decode deliberately remains pending. */ } });
  const controller = new AbortController();
  const decoding = prepareImage(new Blob(["source"], { type: "image/png" }), controller.signal);
  controller.abort();
  await expect(decoding).rejects.toMatchObject({ name: "AbortError" });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:input");
});

it("flattens the base and annotations into a bounded WebP blob", async () => {
  const source = document.createElement("canvas"); source.width = 1920; source.height = 960;
  const out = await exportAnnotatedImage(source, [{ kind: "rect", color: "red", a: { x: 10, y: 20 }, b: { x: 80, y: 90 } }], { red: "red", yellow: "yellow", green: "green" });
  expect(out.type).toBe("image/webp");
  expect(contexts[0].drawImage).toHaveBeenCalledWith(source, 0, 0);
  expect(contexts[0]).toHaveProperty("strokeStyle", "red");
  expect(out.size).toBeLessThanOrEqual(BUG_IMAGE_MAX_BYTES);
});

it("checks the actual encoder MIME and explicitly falls back to PNG", async () => {
  const requested: string[] = [];
  encode = (mime) => { requested.push(mime); return new Blob(["png"], { type: "image/png" }); };
  const source = document.createElement("canvas"); source.width = source.height = 100;
  expect((await exportAnnotatedImage(source)).type).toBe("image/png");
  expect(requested).toEqual(["image/webp", "image/png"]);
});

it("flattens ellipse and freehand marks in native pixels without editor overlays", async () => {
  const source = document.createElement("canvas"); source.width = 1920; source.height = 960;
  const result = await exportAnnotatedImage(source, [
    { kind: "ellipse", color: "yellow", a: { x: 20, y: 40 }, b: { x: 100, y: 80 } },
    { kind: "path", color: "green", points: [{ x: 200, y: 300 }, { x: 240, y: 330 }, { x: 260, y: 310 }] },
  ], { red: "red", yellow: "yellow", green: "green" });
  expect(contexts[0].ellipse).toHaveBeenCalledExactlyOnceWith(60, 60, 40, 20, 0, 0, Math.PI * 2);
  expect(contexts[0].lineTo.mock.calls).toEqual([[240, 330], [260, 310]]);
  expect(contexts[0].fill).not.toHaveBeenCalled();
  expect(contexts).toHaveLength(2);
  expect(contexts[1].drawImage).toHaveBeenCalledExactlyOnceWith(expect.any(HTMLCanvasElement), 0, 0, 1920, 960);
  expect(result.type).toBe("image/webp");
});

it("falls back to PNG when the browser returns no WebP blob", async () => {
  encode = (mime) => mime === "image/webp" ? null : new Blob(["png"], { type: "image/png" });
  const source = document.createElement("canvas"); source.width = source.height = 100;
  expect((await exportAnnotatedImage(source)).type).toBe("image/png");
});

it("resizes an oversized PNG fallback with bounded attempts", async () => {
  const widths: number[] = [];
  encode = (mime, width) => { widths.push(width); return new Blob([new Uint8Array(width > 1200 ? BUG_IMAGE_MAX_BYTES + 1 : 32)], { type: "image/png" }); };
  const source = document.createElement("canvas"); source.width = 1920; source.height = 960;
  expect((await exportAnnotatedImage(source)).size).toBe(32);
  expect(widths.some((width) => width < 1920)).toBe(true);
  expect(widths.length).toBeLessThanOrEqual(12);
});

it("refuses irreducible output or incorrect fallback MIME without returning an unsafe blob", async () => {
  const source = document.createElement("canvas"); source.width = source.height = 1920;
  const encodeSpy = vi.fn(() => new Blob([new Uint8Array(BUG_IMAGE_MAX_BYTES + 1)], { type: "image/png" })); encode = encodeSpy;
  await expect(exportAnnotatedImage(source)).rejects.toThrow(/2 MiB/);
  expect(encodeSpy.mock.calls.length).toBeLessThanOrEqual(12);
  encode = () => new Blob(["unsafe"], { type: "image/jpeg" });
  await expect(exportAnnotatedImage(source)).rejects.toThrow(/บันทึกรูป/);
});
