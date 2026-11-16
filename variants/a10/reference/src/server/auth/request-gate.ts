import "server-only";
import { AuthError } from "./errors";
import { sameSecret } from "./session-cookie";
import type { Session } from "./viewer";

const refused = () => new AuthError(403, "REQUEST_REFUSED", "A10 accepts requests only from its own site");

/** The body a POST may carry: JSON everywhere, multipart/form-data only on the routes that take an upload. */
export type GateOptions = { multipart?: boolean; binary?: boolean };

/**
 * The old app's request gate: no cross-site fetches, and a POST must carry this site's Origin and a JSON body
 * (or, with `multipart`, a form upload). `origin` is A10_PUBLIC_URL's origin, or null in local development (then the
 * request's own origin).
 */
export function checkSameSitePost(request: Request, origin: string | null, { multipart = false, binary = false }: GateOptions = {}): void {
  const own = origin ?? new URL(request.url).origin;
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") throw refused();
  if (request.headers.get("origin") !== own) throw refused();
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/json") && !(multipart && type.startsWith("multipart/form-data")) && !(binary && type === "application/octet-stream")) throw refused();
}

/** For write routes: same-site POST plus the session's CSRF token in x-a10-csrf. The dev stub has no token. */
export function checkWriteRequest(request: Request, session: Session, origin: string | null, options: GateOptions = {}): void {
  checkSameSitePost(request, origin, options);
  if (session.source === "dev") return;
  const given = request.headers.get("x-a10-csrf");
  if (!given || !session.csrf || !sameSecret(given, session.csrf)) {
    throw new AuthError(403, "REQUEST_REFUSED", "Request verification failed");
  }
}

/** The JSON error the old app answered: {error, code, retryable}, never cached. */
export function authErrorResponse(error: AuthError, extra: Record<string, unknown> = {}): Response {
  return Response.json(
    { error: error.message, code: error.code, retryable: error.retryable, ...extra },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );
}
