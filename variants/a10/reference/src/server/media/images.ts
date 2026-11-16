import "server-only";

const startsWith = (bytes: Uint8Array, ...prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte);
const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));

/** The image type of these bytes, or null when they are not an image A10 serves. */
export function sniffImage(bytes: Uint8Array): string | null {
  if (startsWith(bytes, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (startsWith(bytes, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (ascii(bytes, 0, 4) === "GIF8") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (startsWith(bytes, 0x00, 0x00, 0x01, 0x00)) return "image/x-icon";
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}
