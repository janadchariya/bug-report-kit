import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  ObjectStorage,
  PutObjectInput,
  SignedUpload,
  SignedUploadInput,
  StoredObject,
} from "./object-storage";

/**
 * Supabase Storage adapter. Keeps files in a private bucket and reads them
 * back through the same proxy route (`/api/files/{key}`) as the local
 * adapter, so callers never deal with raw Supabase URLs and access control
 * stays in our hands.
 *
 * Required env:
 *   - SUPABASE_URL            (e.g. https://abc123.supabase.co)
 *   - SUPABASE_SERVICE_ROLE_KEY (server-only; bypasses RLS)
 *   - SUPABASE_STORAGE_BUCKET (e.g. "receipts")
 */
/**
 * Supabase Storage rejects non-ASCII characters in object keys, so we strip
 * everything outside [a-zA-Z0-9._-]. The original (Thai) filename is still
 * persisted on the Receipt row's `originalFileName` column for display —
 * the storage key just needs to be a safe identifier, not human-readable.
 */
function safeFileName(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const rawBase = lastDot > 0 ? name.slice(0, lastDot) : name;
  const rawExt = lastDot > 0 ? name.slice(lastDot) : "";
  const base = rawBase
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const ext = rawExt.replace(/[^a-zA-Z0-9.]/g, "").toLowerCase();
  return (base.length > 0 ? base : "file") + ext;
}

function inferMimeType(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  const ext = idx >= 0 ? fileName.slice(idx).toLowerCase() : "";
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".pdf":
      return "application/pdf";
    case ".html":
      return "text/html; charset=utf-8";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

export function createSupabaseStorage(opts?: {
  url?: string;
  serviceRoleKey?: string;
  bucket?: string;
}): ObjectStorage {
  const url = opts?.url ?? process.env.SUPABASE_URL;
  const key = opts?.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = opts?.bucket ?? process.env.SUPABASE_STORAGE_BUCKET;

  if (!url || !key || !bucket) {
    throw new Error(
      "Supabase storage requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET",
    );
  }

  const client: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false },
  });
  const store = () => client.storage.from(bucket);

  async function putObject(input: PutObjectInput): Promise<StoredObject> {
    const prefix = input.prefix.replace(/^\/+|\/+$/g, "");
    const stamped = `${Date.now()}-${safeFileName(input.fileName)}`;
    const key = `${prefix}/${stamped}`;

    const { error } = await store().upload(key, input.buffer, {
      contentType: input.mimeType,
      upsert: false,
    });
    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    return {
      key,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileUrl: `/api/files/${key}`,
    };
  }

  async function readObject(key: string) {
    const cleanKey = key.replace(/^\/+/, "");
    const { data, error } = await store().download(cleanKey);
    if (error || !data) {
      throw new Error(
        `Supabase download failed: ${error?.message ?? "no data"}`,
      );
    }
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = data.type || inferMimeType(cleanKey);
    return { buffer, mimeType };
  }

  async function deleteObject(key: string) {
    const cleanKey = key.replace(/^\/+/, "");
    const { error } = await store().remove([cleanKey]);
    if (error) {
      // Match local adapter — swallow "not found" style errors so callers
      // can re-issue deletes idempotently.
      if (!/not\s*found/i.test(error.message)) {
        throw new Error(`Supabase delete failed: ${error.message}`);
      }
    }
  }

  function getServeUrl(key: string): string {
    return `/api/files/${key.replace(/^\/+/, "")}`;
  }

  async function createSignedUploadUrl(
    input: SignedUploadInput,
  ): Promise<SignedUpload> {
    const prefix = input.prefix.replace(/^\/+|\/+$/g, "");
    const stamped = `${Date.now()}-${safeFileName(input.fileName)}`;
    const key = `${prefix}/${stamped}`;
    const { data, error } = await store().createSignedUploadUrl(key);
    if (error || !data) {
      throw new Error(
        `Supabase createSignedUploadUrl failed: ${error?.message ?? "no data"}`,
      );
    }
    return {
      key,
      fileName: stamped,
      mimeType: input.mimeType,
      signedUrl: data.signedUrl,
      token: data.token,
    };
  }

  return {
    putObject,
    readObject,
    deleteObject,
    getServeUrl,
    createSignedUploadUrl,
  };
}
