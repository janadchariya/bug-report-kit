"use client";

import { useEffect, useState } from "react";

import { IconBug } from "@/components/icons";
import { BugCommentThread } from "./bug-comment-thread";
import { BugDetailEditor } from "./bug-detail-panel";
import { BugPriorityBadge } from "./bug-priority-badge";
import { BugScreenshotViewer } from "./bug-screenshot-viewer";
import { BugStatusBadge } from "./bug-status-badge";
import { BugStatusHistory } from "./bug-status-history";
import type { BugDetail } from "@/lib/bugs/get-bug";

// Shape mirrors bugs-split-view's AssignableUser. Defined locally to avoid a
// circular import (split-view imports this column).
type AssignableUser = {
  id: string;
  fullName: string;
  role: string;
  companyId: string;
};

type Props = {
  bugId: string | null;
  /** Bumped after a save in the detail editor so the parent list can refetch. */
  onBugUpdated?: () => void;
  assignables: AssignableUser[];
  companies: { id: string; name: string }[];
  currentUserId: string;
};

/**
 * Left pane of the split view. Fetches full bug detail (comments + status
 * history) when bugId changes, then renders screenshot + metadata + editor.
 */
export function BugDetailColumn({
  bugId,
  onBugUpdated,
  assignables,
  companies,
  currentUserId,
}: Props) {
  const [detail, setDetail] = useState<BugDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bugId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/bugs/${bugId}`)
      .then(async (r) => {
        const json = await r.json();
        if (cancelled) return;
        if (!r.ok || !json.ok) {
          throw new Error(json?.error?.message ?? "โหลด bug ไม่สำเร็จ");
        }
        setDetail(json.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "โหลด bug ไม่สำเร็จ");
        setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bugId]);

  if (!bugId) {
    return (
      <div className="grid h-full place-items-center text-sm text-slate-400">
        <div className="text-center">
          <div className="text-slate-300"><IconBug size={40} /></div>
          <div className="mt-2">เลือก bug จากด้านขวาเพื่อดูรายละเอียด</div>
        </div>
      </div>
    );
  }

  if (loading && !detail) {
    return (
      <div className="grid h-full place-items-center text-sm text-slate-500">
        กำลังโหลด…
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid h-full place-items-center text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!detail) return null;

  return (
    // key by bug id so the whole detail subtree REMOUNTS when the selected bug
    // changes. The children seed local state from props via useState(initial)
    // (comment list, status/priority/assignee/note), which only runs on mount —
    // without a per-bug key those fields kept the previous bug's values until a
    // hard refresh (stale comment "ค้าง"; worse, the editor's dirty-check could
    // PATCH a new bug with the old bug's status/assignee).
    <BugDetailContent
      key={detail.bug.id}
      detail={detail}
      assignables={assignables}
      companies={companies}
      currentUserId={currentUserId}
      onSaved={() => {
        // Refetch detail to pull updated status history.
        if (!bugId) return;
        fetch(`/api/bugs/${bugId}`)
          .then((r) => r.json())
          .then((json) => {
            if (json?.ok) setDetail(json.data);
          });
        onBugUpdated?.();
      }}
    />
  );
}

function BugDetailContent({
  detail,
  assignables,
  companies,
  currentUserId,
  onSaved,
}: {
  detail: BugDetail;
  assignables: AssignableUser[];
  companies: { id: string; name: string }[];
  currentUserId: string;
  onSaved: () => void;
}) {
  const company = companies.find((c) => c.id === detail.bug.companyId);
  const reporter = assignables.find((u) => u.id === detail.bug.reporterId);

  // Build a user lookup for status history + comment thread.
  const userLookup: Record<string, { fullName: string }> = {};
  for (const u of assignables) userLookup[u.id] = { fullName: u.fullName };
  // Reporter might not be admin/assignable — fall back to email if missing.
  if (reporter) userLookup[reporter.id] = { fullName: reporter.fullName };

  // Restrict assignee dropdown to users from the bug's company plus all admins.
  const visibleAssignables = assignables.filter(
    (u) => u.companyId === detail.bug.companyId || u.role === "ADMIN",
  );

  const ghRepoUrl = process.env.NEXT_PUBLIC_GH_REPO_URL;

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <div>
        <h1 className="text-xl font-bold">{detail.bug.summary}</h1>
        <div className="mt-1 flex items-center gap-2">
          <BugStatusBadge status={detail.bug.status} />
          <BugPriorityBadge priority={detail.bug.priority} />
          <span className="text-xs text-slate-500">
            {new Date(detail.bug.createdAt).toLocaleString("th-TH")}
          </span>
        </div>
      </div>

      <BugScreenshotViewer bugId={detail.bug.id} />

      {detail.bug.description && (
        <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
          <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">
            รายละเอียด
          </h3>
          <p className="whitespace-pre-wrap wrap-anywhere">{detail.bug.description}</p>
        </div>
      )}

      <details className="rounded-md border border-slate-200 bg-white p-3 text-sm">
        <summary className="cursor-pointer text-xs font-semibold uppercase text-slate-500">
          ข้อมูลเทคนิค
        </summary>
        <dl className="mt-2 grid grid-cols-[110px_1fr] gap-y-1 text-xs">
          <dt className="text-slate-500">ผู้แจ้ง</dt>
          <dd>{reporter?.fullName ?? "—"}</dd>
          <dt className="text-slate-500">บริษัท</dt>
          <dd>{company?.name ?? "—"}</dd>
          <dt className="text-slate-500">หน้า</dt>
          <dd>
            <a
              href={detail.bug.pageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 hover:underline"
            >
              {detail.bug.pageUrl}
            </a>
          </dd>
          <dt className="text-slate-500">Browser</dt>
          <dd>
            {detail.bug.browserName ?? "?"} {detail.bug.browserVersion ?? ""}
          </dd>
          <dt className="text-slate-500">OS</dt>
          <dd>
            {detail.bug.osName ?? "?"} {detail.bug.osVersion ?? ""}
          </dd>
          <dt className="text-slate-500">Device</dt>
          <dd>{detail.bug.deviceType ?? "?"}</dd>
          <dt className="text-slate-500">Viewport</dt>
          <dd>
            {detail.bug.viewportWidth}×{detail.bug.viewportHeight}
          </dd>
          <dt className="text-slate-500">Screenshot</dt>
          <dd>
            {detail.bug.screenshotWidth}×{detail.bug.screenshotHeight}
          </dd>
          <dt className="text-slate-500">Build SHA</dt>
          <dd>
            {detail.bug.appBuildSha ? (
              ghRepoUrl ? (
                <a
                  href={`${ghRepoUrl}/commit/${detail.bug.appBuildSha}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 hover:underline"
                >
                  {detail.bug.appBuildSha.slice(0, 7)}
                </a>
              ) : (
                <code>{detail.bug.appBuildSha.slice(0, 7)}</code>
              )
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-slate-500">User Agent</dt>
          <dd className="break-all">{detail.bug.userAgent}</dd>
        </dl>
      </details>

      <BugDetailEditor
        detail={detail}
        assignables={visibleAssignables.map((u) => ({
          id: u.id,
          fullName: u.fullName,
          role: u.role,
        }))}
        onSaved={onSaved}
      />

      <div className="rounded-md border border-slate-200 bg-white p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">
          ประวัติ Status
        </h3>
        <BugStatusHistory
          changes={detail.statusHistory}
          userLookup={userLookup}
        />
      </div>

      <div className="rounded-md border border-blue-100 bg-blue-50/40 p-3">
        <div className="mb-3 flex items-start gap-2.5">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-blue-100 text-blue-600 text-base">
            💬
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">สอบถามผู้แจ้ง</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              ถามผู้แจ้งเพิ่มเติมเพื่อให้เข้าใจปัญหาได้ชัดเจนขึ้น
            </p>
          </div>
        </div>
        <BugCommentThread
          bugId={detail.bug.id}
          initial={detail.comments}
          currentUserId={currentUserId}
          userLookup={userLookup}
        />
      </div>
    </div>
  );
}
