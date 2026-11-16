import "server-only";

/** A refusal with the status and code the old app answered ({error, code, retryable}). */
export class BugError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "BugError";
  }
}

export const badInput = (message: string) => new BugError(400, "INVALID_INPUT", message);
export const bugNotFound = () => new BugError(404, "NOT_FOUND", "Bug report not found");
export const imageNotFound = () => new BugError(404, "NOT_FOUND", "Image not found");
export const adminOnly = () => new BugError(403, "ADMIN_ONLY", "Only A10 admins and the bug fixers can do this.");
export const tooLarge = () => new BugError(413, "FILE_TOO_LARGE", "Images must be 4 MB or smaller");
export const rateLimited = () => new BugError(429, "RATE_LIMITED", "Please wait a few seconds before sending another report.", true);
