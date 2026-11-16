"use client";

// Reporter <-> admin thread on a bug report (bug-report-kit bug-comment-thread.tsx; old PR #2 BugThread.tsx). Text and/or
// one image (paste or pick); the comment and its image go in one request, so a comment never appears without its image.
import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { fullTime, type BugComment } from "@/domain/bug-reports";
import { initials } from "@/domain/person-name";
import { ACCEPT_ATTRIBUTE, encodeForUpload, fileToCanvas, sendsAsIs } from "../lib/image";
import { commentImageUrl, errorText, type BugClient } from "./bug-client";

type Props = { client: BugClient; bugId: string; initial: BugComment[]; onSent?: () => void };

export function BugThread({ client, bugId, initial, onSent }: Props) {
  const [comments, setComments] = useState(initial);
  const [body, setBody] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function pick(file: File) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      setError("Attach a PNG, JPG, WebP or GIF image.");
      return;
    }
    setError(null);
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }
  function clearImage() {
    setImage(null);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = "";
  }
  function onPaste(e: ClipboardEvent) {
    for (const item of Array.from(e.clipboardData?.items ?? [])) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          pick(file);
        }
        return;
      }
    }
  }
  async function send() {
    const text = body.trim();
    if (!text && !image) return;
    setSending(true);
    setError(null);
    try {
      // The same size rule as the screenshot: under 4 MB, re-encoded when needed.
      const blob = image ? (sendsAsIs(image) ? image : (await encodeForUpload(await fileToCanvas(image))).blob) : null;
      const comment = await client.comment(bugId, text, blob);
      setComments((prev) => [...prev, comment]);
      setBody("");
      clearImage();
      onSent?.();
    } catch (e) {
      setError(errorText(e, "Could not send. Try again."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bug-thread">
      <ul className="bug-thread-list">
        {comments.map((c) => {
          const name = c.author.name ?? "Someone";
          return (
            <li key={c.id} className="bug-msg" data-mine={c.author.mine || undefined}>
              <span className="bug-avatar" aria-hidden="true">
                {initials(name)}
              </span>
              <div className="bug-msg-body">
                <small>
                  {c.author.mine ? "You" : name} · {fullTime(c.created_at)}
                </small>
                <div className="bug-bubble">
                  {c.body && <p>{c.body}</p>}
                  {c.has_image && (
                    <a href={commentImageUrl(bugId, c.id)} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a private image served by A10, not optimisable */}
                      <img src={commentImageUrl(bugId, c.id)} alt="Attached image" />
                    </a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {!comments.length && <li className="bug-muted">No messages yet.</li>}
      </ul>
      <div className="bug-compose" onPaste={onPaste}>
        {preview && (
          <div className="bug-compose-preview">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob: URL) */}
            <img src={preview} alt="Image to send" />
            <button type="button" aria-label="Remove image" onClick={clearImage}>
              <X size={12} />
            </button>
          </div>
        )}
        <textarea
          rows={2}
          value={body}
          maxLength={4000}
          disabled={sending}
          aria-label="Message"
          placeholder="Write a message… (paste an image with ⌘/Ctrl+V)"
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="bug-compose-actions">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="bug-sr"
            aria-label="Attach an image"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) pick(file);
            }}
          />
          <button type="button" className="bug-icon" title="Attach an image" aria-label="Attach an image" disabled={sending} onClick={() => fileInput.current?.click()}>
            <Camera size={15} />
          </button>
          {error && (
            <p className="bug-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="bug-btn" data-variant="primary" disabled={sending || (!body.trim() && !image)} onClick={() => void send()}>
            {sending ? (
              <>
                <Loader2 size={14} className="bug-spin" />
                Sending…
              </>
            ) : (
              "Send"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
