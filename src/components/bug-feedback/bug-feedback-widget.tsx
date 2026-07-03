"use client";

import { lazy, Suspense, useState } from "react";

import { IconBug, IconCheck } from "@/components/icons";

import { BugCoachmark, useShowCoachmark } from "./bug-coachmark";
import { collectClientContext } from "./lib/user-agent";
import { requestUploadUrl, submitBug, uploadScreenshot } from "./lib/upload";

const AnnotationModal = lazy(() =>
  import("./annotation-modal").then((m) => ({ default: m.AnnotationModal })),
);

type Phase =
  | { kind: "idle" }
  | { kind: "attaching" }   // modal open, no screenshot yet (or image attached — modal manages internally)
  | { kind: "submitting" }  // upload in progress
  | { kind: "submitted" };

export function BugFeedbackWidget() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [showCoachmark, dismissCoachmark] = useShowCoachmark();

  function handleClick() {
    setError(null);
    dismissCoachmark();
    setPhase({ kind: "attaching" });
  }

  async function handleSubmit(values: {
    summary: string;
    description: string | null;
    pngBlob: Blob;
    width: number;
    height: number;
  }) {
    setPhase({ kind: "submitting" });
    setError(null);
    try {
      const upload = await requestUploadUrl();
      await uploadScreenshot({ uploadUrl: upload.uploadUrl, blob: values.pngBlob });
      const ctx = collectClientContext();
      await submitBug({
        bugId: upload.bugId,
        screenshotPath: upload.path,
        screenshotWidth: values.width,
        screenshotHeight: values.height,
        summary: values.summary,
        description: values.description,
        pageUrl: ctx.pageUrl,
        viewportWidth: ctx.viewportWidth,
        viewportHeight: ctx.viewportHeight,
        userAgent: ctx.userAgent,
        osName: ctx.osName,
        osVersion: ctx.osVersion,
        browserName: ctx.browserName,
        browserVersion: ctx.browserVersion,
        deviceType: ctx.deviceType,
        appBuildSha: ctx.appBuildSha,
      });
      setPhase({ kind: "submitted" });
      setTimeout(() => setPhase({ kind: "idle" }), 1500);
    } catch (err) {
      console.error("[bug-widget] submit failed", err);
      setError(err instanceof Error ? err.message : "ส่งไม่สำเร็จ");
      // Return to attaching so the user can retry without losing their image
      // (the modal keeps its internal screenshot state as long as it stays mounted).
      setPhase({ kind: "attaching" });
    }
  }

  const showFab = phase.kind === "idle" || phase.kind === "submitted";
  const modalOpen = phase.kind === "attaching" || phase.kind === "submitting";

  return (
    <>
      {showFab && (
        <>
          {showCoachmark && <BugCoachmark onDismiss={dismissCoachmark} />}
          <button
            type="button"
            onClick={handleClick}
            aria-label="รายงานปัญหา"
            title="รายงานปัญหา"
            className={`fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full text-white shadow-lg ring-1 ring-black/5 transition hover:scale-105 hover:shadow-xl active:scale-95 md:h-16 md:w-16 ${
              phase.kind === "submitted"
                ? "bg-emerald-500 hover:bg-emerald-600"
                : "bg-[#ff5300] hover:bg-[#e64a00]"
            }`}
          >
            {phase.kind === "submitted" ? (
              <IconCheck size={26} />
            ) : (
              <IconBug size={26} />
            )}
          </button>
        </>
      )}

      {/* Error toast — surfaces upload errors when no modal is open. */}
      {showFab && error && (
        <div className="fixed bottom-20 right-5 z-50 max-w-xs rounded-md bg-red-600 px-3 py-2 text-sm text-white shadow-xl">
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="ปิด"
            className="float-right ml-2 text-white/80 hover:text-white"
          >
            ✕
          </button>
          {error}
        </div>
      )}

      {modalOpen && (
        <Suspense fallback={null}>
          <AnnotationModal
            screenshot={null}
            submitting={phase.kind === "submitting"}
            error={error}
            onClose={() => {
              setPhase({ kind: "idle" });
              setError(null);
            }}
            onSubmit={handleSubmit}
          />
        </Suspense>
      )}
    </>
  );
}
