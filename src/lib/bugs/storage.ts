/**
 * Bug-report screenshot storage helpers. Screenshots live in the existing
 * Supabase Storage bucket (selected via STORAGE_PROVIDER + SUPABASE_*
 * envs) under the prefix `bug-reports/{companyId}/{bugId}/`. We force the
 * filename `screenshot.png` so the path is deterministic and contains zero
 * user input — sidesteps non-ASCII (e.g. Thai) filename pitfalls in storage keys.
 */
import { getObjectStorage } from "@/lib/storage/object-storage";

export function buildScreenshotPrefix(companyId: string, bugId: string): string {
  return `bug-reports/${companyId}/${bugId}`;
}

export function buildScreenshotPath(companyId: string, bugId: string): string {
  return `${buildScreenshotPrefix(companyId, bugId)}/screenshot.png`;
}

export type SignedUploadResult = {
  bugId: string;
  uploadUrl: string;
  token: string;
  path: string;
};

/**
 * Creates a signed upload URL the browser PUTs the PNG directly to. We
 * generate the bugId server-side and lock the storage key shape so the
 * client can't pick its own path.
 */
export async function createScreenshotUpload(opts: {
  bugId: string;
  companyId: string;
}): Promise<SignedUploadResult> {
  const storage = getObjectStorage();
  if (!storage.createSignedUploadUrl) {
    throw new Error("Storage adapter does not support signed uploads");
  }
  const prefix = buildScreenshotPrefix(opts.companyId, opts.bugId);
  const signed = await storage.createSignedUploadUrl({
    prefix,
    fileName: "screenshot.png",
    mimeType: "image/png",
  });
  return {
    bugId: opts.bugId,
    uploadUrl: signed.signedUrl,
    token: signed.token,
    path: signed.key,
  };
}

/** Read the PNG bytes for serving via the auth-gated route. */
export async function readScreenshot(path: string) {
  return getObjectStorage().readObject(path);
}

export function isValidScreenshotPath(
  path: string,
  expected: { companyId: string; bugId: string },
): boolean {
  // Storage adapter may prepend a timestamp (e.g. `1234567890-screenshot.png`).
  // Require the prefix to match exactly, but allow the filename suffix to vary.
  const requiredPrefix = `${buildScreenshotPrefix(
    expected.companyId,
    expected.bugId,
  )}/`;
  return path.startsWith(requiredPrefix);
}

function mimeTypeToExt(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg": return ".jpg";
    case "image/webp": return ".webp";
    default: return ".png";
  }
}

export function buildCommentImagePath(
  companyId: string,
  bugId: string,
  commentId: string,
): string {
  return `bug-reports/${companyId}/${bugId}/comments/${commentId}.png`;
}

export type CommentImageUploadResult = {
  commentId: string;
  uploadUrl: string;
  token: string;
  path: string;
};

export async function createCommentImageUpload(opts: {
  bugId: string;
  companyId: string;
  commentId: string;
  mimeType?: string;
}): Promise<CommentImageUploadResult> {
  const mimeType = opts.mimeType ?? "image/png";
  const ext = mimeTypeToExt(mimeType);
  const storage = getObjectStorage();
  if (!storage.createSignedUploadUrl) {
    throw new Error("Storage adapter does not support signed uploads");
  }
  const prefix = `bug-reports/${opts.companyId}/${opts.bugId}/comments`;
  const signed = await storage.createSignedUploadUrl({
    prefix,
    fileName: `${opts.commentId}${ext}`,
    mimeType,
  });
  return {
    commentId: opts.commentId,
    uploadUrl: signed.signedUrl,
    token: signed.token,
    path: signed.key,
  };
}

export function readCommentImage(path: string) {
  return getObjectStorage().readObject(path);
}

export function isValidCommentImagePath(
  path: string,
  expected: { companyId: string; bugId: string; commentId: string },
): boolean {
  // Storage adapter prepends a timestamp to filenames, so validate by prefix
  // (company + bug + comment dir) rather than exact path. Mirrors isValidScreenshotPath.
  const requiredPrefix = `bug-reports/${expected.companyId}/${expected.bugId}/comments/`;
  return path.startsWith(requiredPrefix);
}
