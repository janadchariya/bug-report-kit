import "server-only";
import { z } from "zod";
import { MAX_BUG_IMAGE_BYTES } from "@/domain/bug-reports";
import { AuthError, WRITES_DISABLED_MESSAGE } from "@/server/auth/errors";
import { getSession, publicOrigin, type Viewer } from "@/server/auth/get-viewer";
import { authErrorResponse, checkSameSitePost, checkWriteRequest } from "@/server/auth/request-gate";
import { BugStorageError, BugsNotSetUpError } from "@/server/db/bug-queries";
import { writesEnabled } from "@/server/writes/wiring";
import { getBugReports, type BugImage, type BugReports, type BugUpload } from "./bug-reports";
import { BugError } from "./errors";

const NO_STORE = { "Cache-Control": "no-store" };
// A multipart request holds one image of at most 4 MB plus the text fields.
const MAX_UPLOAD_BYTES = MAX_BUG_IMAGE_BYTES + 64 * 1024;

const answer = (status: number, code: string, error: string, retryable = false) =>
  Response.json({ error, code, retryable }, { status, headers: NO_STORE });

type Body = "none" | "json" | "multipart";
type Spec<P extends z.ZodType, B extends z.ZodType> = {
  params: P;
  /** none: a read. json and multipart are writes unless `read` says otherwise (a read whose filters need a body). */
  body?: Body;
  schema?: B;
  read?: boolean;
  /** 201 instead of 200: a new report or comment. */
  created?: boolean;
};
type Input<B extends z.ZodType> = { json: z.output<B>; upload: BugUpload };
type Run<P, B extends z.ZodType> = (service: BugReports, viewer: Viewer, params: P, input: Input<B>) => Promise<unknown>;

/**
 * One bug report route. Reads: signed in (401), a same-site request when it has a body (403, no CSRF token), path
 * params (400), one service call. Writes, in the order every A10
 * write checks: signed in (401), same-site request with the session's CSRF token (403), path params (400),
 * A10_WRITES_ENABLED (503 WRITES_DISABLED), the body (400, 413), one service call. Before the migration is applied,
 * every route answers 503 BUGS_NOT_SET_UP.
 */
export function bugRoute<P extends z.ZodType, B extends z.ZodType = z.ZodUndefined>(spec: Spec<P, B>, run: Run<z.output<P>, B>) {
  const kind = spec.body ?? "none";
  const write = kind !== "none" && !spec.read;
  return async (request: Request, context?: { params?: Promise<unknown> }): Promise<Response> => {
    try {
      const session = await getSession();
      if (!session) return answer(401, "LOGIN_REQUIRED", "Sign in to A10 first.");
      // A read with a body (the list's filters) is still same-site only, but sends no CSRF token: it changes nothing.
      const gate = { multipart: kind === "multipart" };
      if (write) checkWriteRequest(request, session, publicOrigin(), gate);
      else if (kind !== "none") checkSameSitePost(request, publicOrigin(), gate);
      // A route without dynamic segments gets no params from Next.
      const params = spec.params.safeParse((await context?.params) ?? {});
      if (!params.success) return answer(400, "INVALID_INPUT", z.prettifyError(params.error));
      if (write && !writesEnabled()) return answer(503, "WRITES_DISABLED", WRITES_DISABLED_MESSAGE);

      const input: Input<B> = { json: undefined as z.output<B>, upload: { fields: {}, files: [] } };
      if (kind === "json") {
        const body = (spec.schema ?? z.undefined()).safeParse(await request.json().catch(() => undefined));
        if (!body.success) return answer(400, "INVALID_INPUT", z.prettifyError(body.error));
        input.json = body.data as z.output<B>;
      } else if (kind === "multipart") {
        if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) throw new BugError(413, "FILE_TOO_LARGE", "Images must be 4 MB or smaller");
        input.upload = await readUpload(request);
      }

      const result = await run(getBugReports(), session.viewer, params.data, input);
      return result instanceof Response ? result : Response.json(result, { status: spec.created ? 201 : 200, headers: NO_STORE });
    } catch (error) {
      return failure(error);
    }
  };
}

async function readUpload(request: Request): Promise<BugUpload> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new BugError(400, "INVALID_INPUT", "Upload must be multipart/form-data");
  }
  const upload: BugUpload = { fields: {}, files: [] };
  for (const [field, value] of form) {
    if (typeof value === "string") upload.fields[field] = value;
    else upload.files.push({ field, file: value });
  }
  return upload;
}

function failure(error: unknown): Response {
  if (error instanceof AuthError) return authErrorResponse(error);
  if (error instanceof BugError) return answer(error.status, error.code, error.message, error.retryable);
  if (error instanceof BugsNotSetUpError) return answer(503, "BUGS_NOT_SET_UP", error.message);
  if (error instanceof BugStorageError) return answer(502, "BUG_STORAGE_FAILED", error.message, true);
  throw error;
}

/** A stored image, sandboxed and never sniffed, as the old image routes answered. */
export function bugImageResponse(image: BugImage): Response {
  return new Response(image.bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.bytes.byteLength),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
