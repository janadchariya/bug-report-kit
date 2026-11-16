// The browser's side of /api/bugs. Reads are GETs (the list filters go in a JSON body); writes carry this site's Origin
// (the browser adds it) and the session's CSRF token in x-a10-csrf, read once from /api/session. The screenshot and
// comment images go up as one multipart request each.
import type {
  BugAssignee,
  BugComment,
  BugCounts,
  BugDetail,
  BugListFilters,
  BugPage,
  BugUpdate,
} from "@/domain/bug-reports";
import { imageExtension, type EncodedImage } from "../lib/image";
import type { ClientContext } from "../lib/user-agent";

/** A refused or failed request, with the server's message and code (BUGS_NOT_SET_UP, WRITES_DISABLED, ...). */
export class BugRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "BugRequestError";
  }
}

export type NewBugReport = { summary: string; description: string | null; image: EncodedImage; context: ClientContext };

const OFFLINE = "Could not reach A10. Check the connection and try again.";
const enc = encodeURIComponent;

export const screenshotUrl = (id: string) => `/api/bugs/${enc(id)}/screenshot`;
export const commentImageUrl = (bugId: string, commentId: string) => `/api/bugs/${enc(bugId)}/comments/${enc(commentId)}/image`;

export function createBugClient(fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  let csrf: Promise<string | null> | null = null;
  // The dev stub has no token (null); a failed read is tried again on the next write.
  const token = () => {
    csrf ??= fetchImpl("/api/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => ((await response.json()) as { csrf?: string | null }).csrf ?? null)
      .catch(() => {
        csrf = null;
        return null;
      });
    return csrf;
  };

  async function call<T>(path: string, init: { method?: string; json?: unknown; form?: FormData; write?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (init.json !== undefined) headers["Content-Type"] = "application/json";
    if (init.write) {
      const value = await token();
      if (value) headers["x-a10-csrf"] = value;
    }
    let response: Response;
    try {
      response = await fetchImpl(path, {
        method: init.method ?? "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers,
        body: init.form ?? (init.json === undefined ? undefined : JSON.stringify(init.json)),
      });
    } catch {
      throw new BugRequestError(0, null, OFFLINE);
    }
    const body = (await response.json().catch(() => null)) as { error?: unknown; code?: unknown } | null;
    if (!response.ok) {
      const fallback = response.status === 413 ? "The image is too large" : "Something went wrong. Try again.";
      throw new BugRequestError(response.status, typeof body?.code === "string" ? body.code : null, typeof body?.error === "string" ? body.error : fallback);
    }
    return body as T;
  }

  return {
    list: (filters: BugListFilters = {}) => call<BugPage>("/api/bugs/search", { method: "POST", json: filters }),
    counts: () => call<BugCounts>("/api/bugs/counts"),
    assignees: () => call<{ people: BugAssignee[] }>("/api/bugs/assignees").then((r) => r.people),
    detail: (id: string) => call<BugDetail>(`/api/bugs/${enc(id)}`),
    update: (id: string, change: Partial<BugUpdate>) => call<BugDetail>(`/api/bugs/${enc(id)}/update`, { method: "POST", json: change, write: true }),
    markRead: (id: string) => call<{ ok: true }>(`/api/bugs/${enc(id)}/read`, { method: "POST", json: {}, write: true }),

    create(report: NewBugReport) {
      const c = report.context;
      const form = new FormData();
      form.set(
        "meta",
        JSON.stringify({
          summary: report.summary,
          description: report.description,
          screenshot_width: report.image.width,
          screenshot_height: report.image.height,
          page_url: c.pageUrl,
          viewport_width: c.viewportWidth,
          viewport_height: c.viewportHeight,
          user_agent: c.userAgent,
          os_name: c.osName,
          os_version: c.osVersion,
          browser_name: c.browserName,
          browser_version: c.browserVersion,
          device_type: c.deviceType,
          app_build_sha: c.appBuildSha,
        }),
      );
      form.set("file", report.image.blob, `screenshot.${imageExtension(report.image.blob.type)}`);
      return call<{ id: string }>("/api/bugs", { method: "POST", form, write: true });
    },

    comment(id: string, body: string, image?: Blob | null) {
      const form = new FormData();
      form.set("body", body);
      if (image) form.set("file", image, `image.${imageExtension(image.type)}`);
      return call<{ comment: BugComment }>(`/api/bugs/${enc(id)}/comments`, { method: "POST", form, write: true }).then((r) => r.comment);
    },
  };
}

export type BugClient = ReturnType<typeof createBugClient>;

export const errorText = (error: unknown, fallback = "Something went wrong. Try again.") =>
  error instanceof Error && error.message ? error.message : fallback;
