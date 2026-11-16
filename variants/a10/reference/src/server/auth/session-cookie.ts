import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Only the request gate helper; keep the host's existing session cookie implementation. */
export function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
