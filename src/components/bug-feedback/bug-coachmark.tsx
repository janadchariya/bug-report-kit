"use client";

import { useSyncExternalStore } from "react";

import { captureShortcut } from "./lib/os-hint";

const STORAGE_KEY = "anga.bugCoachmarkSeen";

// Module-level subscriber set so markSeen() can trigger a re-read in the same tab
// (the native `storage` event only fires in OTHER tabs).
const listeners = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
/** Client snapshot — reads localStorage. */
function getSnapshot(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return true; // localStorage blocked — treat as seen (skip coachmark)
  }
}
/** Server snapshot — always "seen" so SSR renders no coachmark; the client
 *  re-reads after hydration. Using useSyncExternalStore avoids a hydration
 *  mismatch (reading localStorage during render caused server/client to differ). */
function getServerSnapshot(): boolean {
  return true;
}

function markSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

type Props = {
  onDismiss: () => void;
};

export function BugCoachmark({ onDismiss }: Props) {
  const shortcut = captureShortcut();

  return (
    <div
      role="tooltip"
      className="fixed bottom-24 right-5 z-[55] w-72 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-2xl"
    >
      {/* Pointer triangle */}
      <div className="absolute -bottom-2 right-6 h-0 w-0 border-x-8 border-t-8 border-x-transparent border-t-slate-900" />

      <p className="font-semibold mb-2">วิธีรายงานปัญหา</p>
      <ol className="space-y-1 text-slate-300 text-xs list-decimal list-inside">
        <li>แคปหน้าจอที่เจอปัญหา ({shortcut})</li>
        <li>กดปุ่มแมลงนี้</li>
        <li>วางภาพ (⌘/Ctrl+V) แล้วส่ง</li>
      </ol>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 w-full rounded-lg bg-[#ff5300] py-1.5 text-xs font-semibold text-white hover:bg-[#e64a00] transition"
      >
        เข้าใจแล้ว
      </button>
    </div>
  );
}

/**
 * Returns [show, dismiss]. SSR renders nothing (server snapshot = seen); after
 * hydration the client reads localStorage and shows the coachmark if unseen.
 */
export function useShowCoachmark(): [boolean, () => void] {
  const seen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [!seen, markSeen];
}
