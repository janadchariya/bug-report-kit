import "server-only";

export type AuthErrorCode =
  | "LAUNCH_TOKEN_INVALID"
  | "LAUNCH_TOKEN_EXPIRED"
  | "LAUNCH_TOKEN_REPLAYED"
  | "OPERATOR_DENIED"
  | "OPERATOR_VERIFICATION_UNAVAILABLE"
  | "AUTH_NOT_CONFIGURED"
  | "LOGIN_REQUIRED"
  | "REQUEST_REFUSED"
  | "WRITES_DISABLED"
  | "STAGING_LOCKED"
  | "TOO_MANY_ATTEMPTS";

/** A sign-in failure with the status and code the old app answered. Messages never carry tokens, keys or ids. */
export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: AuthErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export const invalidLaunch = (code: "LAUNCH_TOKEN_INVALID" | "LAUNCH_TOKEN_EXPIRED") =>
  new AuthError(401, code, "This sign-in link is invalid or has expired. Open A10 from ANGA TWO again.");

export const replayedLaunch = () =>
  new AuthError(401, "LAUNCH_TOKEN_REPLAYED", "This sign-in link was already used. Open A10 from ANGA TWO again.");

export const denied = (message = "An active ANGA TWO employee is required") => new AuthError(403, "OPERATOR_DENIED", message);

export const unavailable = () =>
  new AuthError(503, "OPERATOR_VERIFICATION_UNAVAILABLE", "Identity verification is temporarily unavailable. Retry the connection.", true);

export const notConfigured = (key: string) => new AuthError(503, "AUTH_NOT_CONFIGURED", `A10 sign-in isn't ready yet: an administrator has to set ${key}`);

/** What every write route answers while A10_WRITES_ENABLED is off (503 WRITES_DISABLED): shown to people as-is in toasts. */
export const WRITES_DISABLED_MESSAGE =
  "ทีม dev กำลังแก้ไขปัญหาอยู่ ตอนนี้ยังแก้ไขหรือบันทึกอะไรบน A10 ไม่ได้ชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลัง (Writes are paused while we fix an issue.)";
