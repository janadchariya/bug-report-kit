import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

type SecretPurpose = "chat-webhook" | "calendar-feed";
const SALT = "bug-report-kit:credentials:v1";

function binding(purpose: SecretPurpose, userId: string, authSecret: string) {
  if (!(purpose === "chat-webhook" || purpose === "calendar-feed") || !userId || authSecret.length < 32) throw new Error("sealed_secret_invalid");
  return {
    key: Buffer.from(hkdfSync("sha256", authSecret, SALT, `bug-report-kit:${purpose}:v1`, 32)),
    aad: Buffer.from(JSON.stringify(["bug-report-kit:credentials:v1", purpose, userId]), "utf8"),
  };
}

/** The envelope is server-only; purpose and owner are authenticated, never stored plaintext. */
export function sealSecret(value: string, purpose: SecretPurpose, userId: string, authSecret: string): string {
  const { key, aad } = binding(purpose, userId, authSecret);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function openSecret(envelope: string, purpose: SecretPurpose, userId: string, authSecret: string): string {
  try {
    const parts = envelope.split(".");
    if (parts.length !== 4 || parts[0] !== "v1" || parts.slice(1).some((part) => !/^[A-Za-z0-9_-]*$/.test(part))) throw new Error();
    const [nonce, tag, ciphertext] = parts.slice(1).map((part) => {
      const bytes = Buffer.from(part, "base64url");
      if (bytes.toString("base64url") !== part) throw new Error();
      return bytes;
    });
    if (nonce.length !== 12 || tag.length !== 16) throw new Error();
    const { key, aad } = binding(purpose, userId, authSecret);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Never forward a crypto/provider error message that may contain credential material.
    throw new Error("sealed_secret_invalid");
  }
}
