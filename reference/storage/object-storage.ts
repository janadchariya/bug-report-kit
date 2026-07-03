import { promises as fs } from "node:fs";
import path from "node:path";

export type PutObjectInput = {
  prefix: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
};

export type StoredObject = {
  key: string;
  fileName: string;
  mimeType: string;
  fileUrl: string;
};

export type SignedUploadInput = {
  prefix: string;
  fileName: string;
  mimeType: string;
};

export type SignedUpload = {
  /** Storage key the file will live at after the browser PUTs to signedUrl. */
  key: string;
  /** Stamped filename (matches the key tail). */
  fileName: string;
  mimeType: string;
  /** Full URL the browser PUTs the file body to. */
  signedUrl: string;
  /** Token query param the URL needs (some adapters embed it, others don't). */
  token: string;
};

export type ObjectStorage = {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  readObject(key: string): Promise<{ buffer: Buffer; mimeType: string }>;
  deleteObject(key: string): Promise<void>;
  getServeUrl(key: string): string;
  /**
   * Issue a signed URL so the browser can upload directly to the backing
   * store, bypassing Vercel's serverless body cap. Optional — adapters that
   * don't support it (e.g. local filesystem) should leave this undefined and
   * callers will fall back to multipart upload.
   */
  createSignedUploadUrl?(input: SignedUploadInput): Promise<SignedUpload>;
};

const DEFAULT_DIR = ".data";

function safeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._\-ก-๙\s]/g, "_").trim();
  return base.length > 0 ? base : "file";
}

export function createFilesystemStorage(rootDir?: string): ObjectStorage {
  const root = path.resolve(
    process.cwd(),
    rootDir ?? process.env.LOCAL_STORAGE_DIR ?? DEFAULT_DIR,
  );

  async function ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
  }

  async function putObject(input: PutObjectInput): Promise<StoredObject> {
    const prefix = input.prefix.replace(/^\/+|\/+$/g, "");
    const dir = path.join(root, prefix);
    await ensureDir(dir);
    const stamped = `${Date.now()}-${safeFileName(input.fileName)}`;
    const absolutePath = path.join(dir, stamped);
    await fs.writeFile(absolutePath, input.buffer);
    const key = path.posix.join(prefix, stamped);
    return {
      key,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileUrl: `/api/files/${key}`,
    };
  }

  async function readObject(key: string) {
    const cleanKey = key.replace(/^\/+/, "");
    const absolutePath = path.join(root, cleanKey);
    const resolved = path.resolve(absolutePath);
    if (!resolved.startsWith(root)) {
      throw new Error("Invalid key");
    }
    const buffer = await fs.readFile(resolved);
    const mimeType = inferMimeType(cleanKey);
    return { buffer, mimeType };
  }

  async function deleteObject(key: string) {
    const cleanKey = key.replace(/^\/+/, "");
    const absolutePath = path.join(root, cleanKey);
    const resolved = path.resolve(absolutePath);
    if (!resolved.startsWith(root)) {
      throw new Error("Invalid key");
    }
    await fs.unlink(resolved).catch(() => undefined);
  }

  function getServeUrl(key: string) {
    return `/api/files/${key.replace(/^\/+/, "")}`;
  }

  return { putObject, readObject, deleteObject, getServeUrl };
}

function inferMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
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

let cachedStorage: ObjectStorage | null = null;

export function getObjectStorage(): ObjectStorage {
  if (!cachedStorage) {
    const provider = (process.env.STORAGE_PROVIDER ?? "local").toLowerCase();
    if (provider === "supabase") {
      // Lazy-require so the @supabase/supabase-js dependency only loads when
      // it's actually selected — keeps cold-start fast for local dev.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createSupabaseStorage } = require("./supabase-storage") as typeof import("./supabase-storage");
      cachedStorage = createSupabaseStorage();
    } else {
      cachedStorage = createFilesystemStorage();
    }
  }
  return cachedStorage;
}
