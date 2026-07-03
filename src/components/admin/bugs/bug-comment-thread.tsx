"use client";

import { useRef, useState } from "react";

import { IconCamera } from "@/components/icons";
import type { BugReportComment } from "@/lib/bugs/types";

const IMAGE_ONLY_BODY = "(รูปภาพ)";

type Props = {
  bugId: string;
  initial: BugReportComment[];
  currentUserId: string;
  userLookup: Record<string, { fullName: string }>;
};

function imageApiPath(bugId: string, commentId: string) {
  return `/api/bugs/${bugId}/comments/${commentId}/image`;
}

export function BugCommentThread({
  bugId,
  initial,
  currentUserId,
  userLookup,
}: Props) {
  const [comments, setComments] = useState(initial);
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(file: File) {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === "file" && /^image\/(png|jpeg|webp)$/.test(item.type)) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          pickFile(file);
        }
        return;
      }
    }
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send() {
    const trimmed = body.trim();
    if (!trimmed && !imageFile) return;
    setSending(true);
    setError(null);
    try {
      // 1. POST comment (text only first)
      const res = await fetch(`/api/bugs/${bugId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: trimmed || IMAGE_ONLY_BODY }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message ?? "ส่งไม่สำเร็จ");
      const comment: BugReportComment = json.data.comment;

      let finalComment = comment;
      if (imageFile) {
        try {
          // 2. Get signed upload URL using real commentId
          const urlRes = await fetch(`/api/bugs/${bugId}/comments/upload-url`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ commentId: comment.id, mimeType: imageFile.type }),
          });
          const urlJson = await urlRes.json();
          if (urlRes.ok && urlJson.ok) {
            // 3. PUT image bytes to Supabase
            await fetch(urlJson.data.uploadUrl, {
              method: "PUT",
              headers: { "content-type": imageFile.type || "image/png" },
              body: imageFile,
            });
            // 4. PATCH storage path onto comment in DB
            await fetch(`/api/bugs/${bugId}/comments/${comment.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ imageUrl: urlJson.data.path }),
            });
            // Display via auth-gated serving route
            finalComment = {
              ...comment,
              imageUrl: imageApiPath(bugId, comment.id),
            };
          }
        } catch {
          // Image upload failed silently — comment text was already saved
        }
      }

      setComments((prev) => [...prev, finalComment]);
      setBody("");
      clearImage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {comments.map((c) => {
          const isMe = c.authorId === currentUserId;
          const authorName = userLookup[c.authorId]?.fullName ?? "—";
          const initials = authorName
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          return (
            <li
              key={c.id}
              className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}
            >
              {/* Avatar */}
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                {initials}
              </div>
              {/* Bubble */}
              <div
                className={`flex min-w-0 max-w-[75%] flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}
              >
                <div
                  className={`text-[10px] text-slate-500 ${isMe ? "text-right" : "text-left"}`}
                >
                  {authorName} ·{" "}
                  {new Date(c.createdAt).toLocaleString("th-TH")}
                </div>
                <div
                  className={`max-w-full rounded-2xl px-3 py-2 text-sm ${
                    isMe
                      ? "rounded-tr-sm bg-slate-900 text-white"
                      : "rounded-tl-sm bg-slate-100 text-slate-900"
                  }`}
                >
                  {c.body !== IMAGE_ONLY_BODY && (
                    <p className="whitespace-pre-wrap wrap-anywhere">{c.body}</p>
                  )}
                  {c.imageUrl && (
                    <a href={imageApiPath(bugId, c.id)} target="_blank" rel="noreferrer">
                      <img
                        src={imageApiPath(bugId, c.id)}
                        alt="attachment"
                        className="mt-1 max-h-48 rounded-lg object-contain"
                      />
                    </a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {comments.length === 0 && (
          <li className="text-xs text-slate-500">ยังไม่มี comment</li>
        )}
      </ul>

      {/* Compose area */}
      <div
        className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
        onPaste={handlePaste}
      >
        {imagePreview && (
          <div className="relative mb-2 inline-block">
            <img
              src={imagePreview}
              alt="preview"
              className="max-h-32 rounded-lg object-contain"
            />
            <button
              type="button"
              onClick={clearImage}
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white hover:bg-red-600"
            >
              ✕
            </button>
          </div>
        )}
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="พิมพ์ข้อความ… (วางรูปด้วย Ctrl+V ได้)"
          className="w-full resize-none rounded-lg border-0 bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          disabled={sending}
        />
        <div className="flex items-center justify-between gap-2 pt-1">
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickFile(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={sending}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              title="แนบรูป (PNG, JPG, WebP)"
            >
              <IconCamera size={16} aria-hidden />
            </button>
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <button
            type="button"
            onClick={send}
            disabled={sending || (!body.trim() && !imageFile)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {sending ? "ส่ง…" : "ส่ง"}
          </button>
        </div>
      </div>
    </div>
  );
}
