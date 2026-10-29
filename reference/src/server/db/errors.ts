/** Extract only an SQLSTATE code; never serialize a driver error containing query values. */
export function pgErrorCode(error: unknown): string | null {
  for (let depth = 0; depth < 5 && error && typeof error === 'object'; depth++) {
    const value = error as { code?: unknown; cause?: unknown };
    if (typeof value.code === 'string' && /^[A-Z0-9]{5}$/.test(value.code)) return value.code;
    error = value.cause;
  }
  return null;
}
