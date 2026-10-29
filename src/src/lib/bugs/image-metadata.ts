import { BUG_IMAGE_MAX_BYTES, BUG_IMAGE_MAX_EDGE } from "@/src/domain/bugs";

export interface InspectedBugImage { mimeType: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number; byteCount: number }
const invalid = (): never => { throw new Error("invalid_bug_image"); };
function text(a: Uint8Array, start: number, count: number): string { return String.fromCharCode(...a.subarray(start, start + count)); }
function u32(a: Uint8Array, offset: number, le = false): number {
  if (offset < 0 || offset + 4 > a.length) return invalid();
  return new DataView(a.buffer, a.byteOffset + offset, 4).getUint32(0, le);
}
function crc32(a: Uint8Array): number {
  let n = 0xffffffff;
  for (const b of a) { n ^= b; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); }
  return (n ^ 0xffffffff) >>> 0;
}
function dimensions(width: number, height: number): [number, number] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > BUG_IMAGE_MAX_EDGE || height > BUG_IMAGE_MAX_EDGE || width * height > 3_686_400) return invalid();
  return [width, height];
}

function png(a: Uint8Array): [number, number] {
  let offset = 8, size: [number, number] | undefined, idat = false, imageBytes = 0, endedIdat = false, palette = false, color = -1;
  while (offset < a.length) {
    if (offset + 12 > a.length) return invalid();
    const length = u32(a, offset), type = text(a, offset + 4, 4), end = offset + 12 + length;
    if (end > a.length || !/^[A-Za-z]{4}$/.test(type) || crc32(a.subarray(offset + 4, end - 4)) !== u32(a, end - 4)) return invalid();
    if (["acTL", "fcTL", "fdAT"].includes(type)) return invalid();
    if (!size && type !== "IHDR") return invalid();
    if (type === "IHDR") {
      if (size || length !== 13) return invalid();
      size = dimensions(u32(a, offset + 8), u32(a, offset + 12));
      const depth = a[offset + 16]; color = a[offset + 17];
      const depths: Record<number, readonly number[]> = { 0: [1,2,4,8,16], 2: [8,16], 3: [1,2,4,8], 4: [8,16], 6: [8,16] };
      if (!depths[color]?.includes(depth) || a[offset + 18] !== 0 || a[offset + 19] !== 0 || a[offset + 20] > 1) return invalid();
    } else if (type === "IDAT") {
      if (endedIdat || (color === 3 && !palette)) return invalid();
      idat = true; imageBytes += length;
    } else if (type === "IEND") {
      if (length !== 0 || !idat || imageBytes === 0 || end !== a.length) return invalid();
      return size ?? invalid();
    } else {
      if (idat) endedIdat = true;
      if (type === "PLTE") {
        if (palette || idat || length < 3 || length > 768 || length % 3 || color === 0 || color === 4) return invalid();
        palette = true;
      } else if (type[0] === type[0].toUpperCase()) return invalid();
    }
    offset = end;
  }
  return invalid();
}

function jpeg(a: Uint8Array): [number, number] {
  let offset = 2, size: [number, number] | undefined, scan = false;
  while (offset < a.length) {
    if (a[offset++] !== 0xff) return invalid();
    while (a[offset] === 0xff) offset++;
    const marker = a[offset++];
    if (marker === 0xd9) return size && scan && offset === a.length ? size : invalid();
    if (marker === undefined || marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) return invalid();
    if (offset + 2 > a.length) return invalid();
    const length = a[offset] * 256 + a[offset + 1], end = offset + length;
    if (length < 2 || end > a.length) return invalid();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      const components = a[offset + 7];
      if (size || length < 11 || length !== 8 + components * 3 || a[offset + 2] !== 8 || ![1,3,4].includes(components)) return invalid();
      size = dimensions(a[offset + 5] * 256 + a[offset + 6], a[offset + 3] * 256 + a[offset + 4]);
    } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4,0xc8,0xcc].includes(marker)) return invalid();
    if (marker === 0xda) {
      const components = a[offset + 2];
      if (!size || length !== 6 + components * 2 || ![1,2,3,4].includes(components)) return invalid();
      scan = true; offset = end;
      // Entropy data contains byte-stuffed FF00 and standalone restart markers.
      while (offset < a.length) {
        if (a[offset] !== 0xff) { offset++; continue; }
        let next = offset + 1;
        while (a[next] === 0xff) next++;
        if (a[next] === 0 || (a[next] >= 0xd0 && a[next] <= 0xd7)) { offset = next + 1; continue; }
        break;
      }
    } else offset = end;
  }
  return invalid();
}

function webp(a: Uint8Array): [number, number] {
  if (u32(a, 4, true) + 8 !== a.length) return invalid();
  let offset = 12, size: [number, number] | undefined, canvas: [number, number] | undefined, alpha = false, flags = 0, losslessAlpha = false;
  const metadata = new Set<string>();
  while (offset < a.length) {
    if (offset + 8 > a.length) return invalid();
    const kind = text(a, offset, 4), length = u32(a, offset + 4, true), start = offset + 8, end = start + length, padded = end + (length % 2);
    if (padded > a.length || (length % 2 && a[end] !== 0) || ["ANIM", "ANMF"].includes(kind)) return invalid();
    if (kind === "VP8X") {
      if (offset !== 12 || length !== 10 || canvas || (a[start] & 0xc3) || a[start+1] || a[start+2] || a[start+3]) return invalid();
      flags = a[start];
      canvas = dimensions(1 + a[start+4] + (a[start+5]<<8) + (a[start+6]<<16), 1 + a[start+7] + (a[start+8]<<8) + (a[start+9]<<16));
    } else if (kind === "VP8 " || kind === "VP8L") {
      if (size) return invalid();
      if (kind === "VP8 ") {
        if (length < 11 || (a[start] & 1) || !(a[start] & 0x10) || ((a[start] >>> 1) & 7) > 3 || text(a,start+3,3) !== "\x9d\x01\x2a") return invalid();
        const partitionLength = (a[start] | (a[start+1]<<8) | (a[start+2]<<16)) >>> 5;
        if (partitionLength < 1 || partitionLength > length - 10) return invalid();
        size = dimensions((a[start+6] | (a[start+7]<<8)) & 0x3fff, (a[start+8] | (a[start+9]<<8)) & 0x3fff);
      } else {
        if (alpha || length < 6 || a[start] !== 0x2f) return invalid();
        const bits = u32(a, start+1, true);
        if (bits >>> 29) return invalid();
        losslessAlpha = Boolean(bits & 0x10000000);
        size = dimensions(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff));
      }
    } else if (kind === "ALPH") {
      if (!canvas || !(flags & 0x10) || size || alpha || length < 1 || (a[start] & 0xc0)) return invalid();
      const compression = a[start] & 0x03, preprocessing = (a[start] >>> 4) & 0x03;
      if (compression > 1 || preprocessing > 1) return invalid();
      alpha = true;
    } else {
      if (!canvas || !["ICCP", "EXIF", "XMP "].includes(kind) || metadata.has(kind)) return invalid();
      const required = kind === "ICCP" ? 0x20 : kind === "EXIF" ? 0x08 : 0x04;
      if (!(flags & required)) return invalid();
      metadata.add(kind);
    }
    offset = padded;
  }
  if (!size || (canvas && (canvas[0] !== size[0] || canvas[1] !== size[1]))) return invalid();
  if (canvas && ((Boolean(flags & 0x10) !== (alpha || losslessAlpha)) || Boolean(flags & 0x20) !== metadata.has("ICCP") || Boolean(flags & 0x08) !== metadata.has("EXIF") || Boolean(flags & 0x04) !== metadata.has("XMP "))) return invalid();
  return size;
}

/** Checks bounded raster containers; this does not perform a full pixel decode. */
export function inspectBugImage(bytes: Uint8Array): InspectedBugImage {
  if (!bytes.length || bytes.length > BUG_IMAGE_MAX_BYTES) return invalid();
  let mimeType: InspectedBugImage["mimeType"], size: [number, number];
  if (text(bytes,0,8) === "\x89PNG\r\n\x1a\n") { mimeType = "image/png"; size = png(bytes); }
  else if (bytes[0] === 0xff && bytes[1] === 0xd8) { mimeType = "image/jpeg"; size = jpeg(bytes); }
  else if (text(bytes,0,4) === "RIFF" && text(bytes,8,4) === "WEBP") { mimeType = "image/webp"; size = webp(bytes); }
  else return invalid();
  return { mimeType, width:size[0], height:size[1], byteCount:bytes.length };
}
