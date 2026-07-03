/**
 * Browser-side upload helpers. Hits our two API endpoints and the signed
 * Supabase URL we get back.
 */

export type UploadUrlResponse = {
  bugId: string;
  uploadUrl: string;
  token: string;
  path: string;
};

export async function requestUploadUrl(): Promise<UploadUrlResponse> {
  const res = await fetch("/api/bugs/upload-url", { method: "POST" });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json?.error?.message ?? "Failed to get upload URL");
  }
  return json.data;
}

export async function uploadScreenshot(opts: {
  uploadUrl: string;
  blob: Blob;
}): Promise<void> {
  const res = await fetch(opts.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "image/png" },
    body: opts.blob,
  });
  if (!res.ok) {
    throw new Error(`Screenshot upload failed: HTTP ${res.status}`);
  }
}

export type SubmitBugInput = {
  bugId: string;
  screenshotPath: string;
  screenshotWidth: number;
  screenshotHeight: number;
  summary: string;
  description: string | null;
  pageUrl: string;
  viewportWidth: number;
  viewportHeight: number;
  userAgent: string;
  osName: string | null;
  osVersion: string | null;
  browserName: string | null;
  browserVersion: string | null;
  deviceType: "desktop" | "tablet" | "mobile" | null;
  appBuildSha: string | null;
};

export async function submitBug(input: SubmitBugInput): Promise<{ id: string }> {
  const res = await fetch("/api/bugs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json?.error?.message ?? "Submission failed");
  }
  return json.data;
}
