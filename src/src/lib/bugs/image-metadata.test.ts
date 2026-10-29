import { describe, expect, it } from "vitest";
import { inspectBugImage } from "./image-metadata";

function concat(...parts: Uint8Array[]): Uint8Array { return Uint8Array.from(parts.flatMap(p => [...p])); }
function u32(value: number, le = false): Uint8Array { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, value, le); return a; }
function ascii(value: string): Uint8Array { return Uint8Array.from([...value].map(c => c.charCodeAt(0))); }
function crc(data: Uint8Array): number { let n = 0xffffffff; for (const b of data) { n ^= b; for (let j = 0; j < 8; j++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); } return (n ^ 0xffffffff) >>> 0; }
function pngChunk(type: string, data: Uint8Array): Uint8Array { const body = concat(ascii(type), data); return concat(u32(data.length), body, u32(crc(body))); }
function png(width = 1, height = 1, extra?: Uint8Array): Uint8Array {
  return concat(Uint8Array.from([137,80,78,71,13,10,26,10]), pngChunk("IHDR", concat(u32(width), u32(height), Uint8Array.from([8,6,0,0,0]))), ...(extra ? [extra] : []),
    pngChunk("IDAT", Uint8Array.from([120,156,99,0,1,0,0,5,0,1])), pngChunk("IEND", new Uint8Array()));
}
function riffChunk(type: string, data: Uint8Array): Uint8Array { return concat(ascii(type), u32(data.length, true), data, ...(data.length % 2 ? [new Uint8Array(1)] : [])); }
function webp(...chunks: Uint8Array[]): Uint8Array { const body = concat(ascii("WEBP"), ...chunks); return concat(ascii("RIFF"), u32(body.length, true), body); }
function vp8(width = 1, height = 1): Uint8Array { return riffChunk("VP8 ", Uint8Array.from([0x30,0,0,0x9d,1,0x2a,width & 255,width >>> 8,height & 255,height >>> 8,0])); }
function vp8l(width = 1, height = 1): Uint8Array { const bits = (width - 1) | ((height - 1) << 14); return riffChunk("VP8L", concat(Uint8Array.from([0x2f]), u32(bits, true), Uint8Array.from([0]))); }
function vp8x(width = 1, height = 1, flags = 0): Uint8Array { return riffChunk("VP8X", Uint8Array.from([flags,0,0,0,(width-1)&255,(width-1)>>>8,0,(height-1)&255,(height-1)>>>8,0])); }
function jpeg(width = 1, height = 1): Uint8Array { return Uint8Array.from([255,216,255,192,0,11,8,height>>>8,height&255,width>>>8,width&255,1,1,0x11,0,255,218,0,8,1,1,0,0,63,0,1,255,217]); }

describe("bounded raster metadata validation", () => {
  it.each([[png(1920,1080), "image/png",1920,1080], [jpeg(1200,900),"image/jpeg",1200,900], [webp(vp8(640,480)),"image/webp",640,480], [webp(vp8l(800,600)),"image/webp",800,600], [webp(vp8x(320,240),vp8(320,240)),"image/webp",320,240]] as const)("sniffs valid raster independently of filename", (bytes,mimeType,width,height) => {
    expect(inspectBugImage(bytes)).toEqual({ mimeType,width,height,byteCount:bytes.length });
  });
  it("accepts the exact byte and dimension bounds", () => {
    const bytes = png(1920,1920,pngChunk("tEXt",new Uint8Array(2_097_152 - png().length - 12)));
    expect(bytes.length).toBe(2_097_152);
    expect(inspectBugImage(bytes)).toMatchObject({width:1920,height:1920,byteCount:2_097_152});
  });
  it.each([png(1921,1), png(1,1921), png(0,1), jpeg(0,1), webp(vp8(1921,1)), webp(vp8l(1,1921)), new Uint8Array(), new Uint8Array(2_097_153), ascii("<svg width='1' height='1'></svg>"), ascii("GIF89a")])("rejects invalid bounds and other formats", bytes => expect(() => inspectBugImage(bytes)).toThrow("invalid_bug_image"));
  it.each([
    png().slice(0,-1), concat(png(),new Uint8Array(1)), png(1,1,pngChunk("acTL",new Uint8Array(8))),
    webp(vp8x(1,1,2),vp8()), webp(riffChunk("ANIM",new Uint8Array(6)),vp8()), webp(vp8x(2,2),vp8()),
    webp(vp8(),vp8()), webp(vp8()).slice(0,-1), jpeg().slice(0,-2),
    Uint8Array.from([255,216,255,192,255,255,8,0,1,0,1]),
  ])("rejects malformed, truncated or animated containers", bytes => expect(() => inspectBugImage(bytes)).toThrow("invalid_bug_image"));
  it("rejects corrupt chunk CRC, invalid JPEG segment lengths and RIFF size", () => {
    const corruptPng=png(); corruptPng[29]^=1;
    const corruptJpeg=jpeg(); corruptJpeg[5]=1;
    const corruptWebp=webp(vp8()); corruptWebp[4]++;
    for(const bytes of [corruptPng,corruptJpeg,corruptWebp]) expect(() => inspectBugImage(bytes)).toThrow("invalid_bug_image");
  });
  it("rejects empty PNG image payload and inconsistent extended WebP features", () => {
    const emptyPng = concat(png().slice(0,33), pngChunk("IDAT",new Uint8Array()),pngChunk("IEND",new Uint8Array()));
    for(const bytes of [emptyPng, webp(vp8x(1,1,16),vp8()),webp(vp8x(),riffChunk("ALPH",Uint8Array.from([0])),vp8()),webp(vp8x(),riffChunk("EXIF",new Uint8Array()),vp8())]) {
      expect(() => inspectBugImage(bytes)).toThrow("invalid_bug_image");
    }
  });
  it("accepts actual encoder-produced PNG and JPEG containers", () => {
    const pngBytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAABAAAAAQBPJcTWAAAAGUlEQVR4nGP8//8/AymAhSTVoxpGNQwpDQCDXQM7jf4OjwAAAABJRU5ErkJggg=="), c=>c.charCodeAt(0));
    const jpegBytes = Uint8Array.from(atob("/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjI4LjEwMQD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABLAAEBAAAAAAAAAAAAAAAAAAAABwEBAAAAAAAAAAAAAAAAAAAAABABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIABAAEAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AL+AD//Z"),c=>c.charCodeAt(0));
    expect(inspectBugImage(pngBytes)).toMatchObject({mimeType:"image/png",width:16,height:16});
    expect(inspectBugImage(jpegBytes)).toMatchObject({mimeType:"image/jpeg",width:16,height:16});
  });
  it.each([
    "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoQABAAAgA0JaQAA3AA/vuUAAA=",
    "UklGRh4AAABXRUJQVlA4TBEAAAAvD8ADAAfQ//73v/+BiOh/AAA=",
    "UklGRkgAAABXRUJQVlA4WAoAAAAQAAAADwAADwAAQUxQSAoAAAABB1DAiAhERP8DVlA4IBgAAAAwAQCdASoQABAAAgA0JaQAA3AA/vuUAAA=",
    "UklGRh4AAABXRUJQVlA4TBEAAAAvD8ADEAfQ//73v4CBiOh/AAA=",
  ])("accepts real lossy/lossless WebP encoder output with and without alpha", base64 => {
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
    expect(inspectBugImage(bytes)).toMatchObject({mimeType:"image/webp",width:16,height:16});
  });
  it.each([
    ["compression", 0x02], ["compression", 0x03],
    ["preprocessing", 0x21], ["preprocessing", 0x31],
    ["reserved bits", 0x41], ["reserved bits", 0x81],
  ] as const)("rejects reserved ALPH %s in encoder-produced WebP (header %i)", (_field, header) => {
    const bytes = Uint8Array.from(atob("UklGRkgAAABXRUJQVlA4WAoAAAAQAAAADwAADwAAQUxQSAoAAAABB1DAiAhERP8DVlA4IBgAAAAwAQCdASoQABAAAgA0JaQAA3AA/vuUAAA="), c => c.charCodeAt(0));
    expect(inspectBugImage(bytes)).toMatchObject({ mimeType: "image/webp", width: 16, height: 16 });
    // This fixture's ALPH chunk starts at byte 30, followed by its 8-byte chunk header.
    expect(bytes.subarray(30, 34)).toEqual(ascii("ALPH"));
    expect(bytes[38]).toBe(1);
    bytes[38] = header;
    expect(() => inspectBugImage(bytes)).toThrow("invalid_bug_image");
  });
  it.each([0x00, 0x04, 0x08, 0x0c, 0x10, 0x14, 0x18, 0x1c])("accepts defined uncompressed ALPH filtering and preprocessing (header %i)", header => {
    const bytes = webp(vp8x(1, 1, 0x10), riffChunk("ALPH", Uint8Array.from([header, 255])), vp8());
    expect(inspectBugImage(bytes)).toMatchObject({ mimeType: "image/webp", width: 1, height: 1 });
  });
});
