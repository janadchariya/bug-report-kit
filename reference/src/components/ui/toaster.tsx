"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const EVENT = "bug-report-kit:toast";
const VISIBLE_MS = 5_000;

export interface ToastInput {
  readonly text: string;
  readonly href?: string;
}

/** Shows a short message that outlives the component that raised it (e.g. a row that disappears after saving). */
export function showToast(input: ToastInput): void {
  window.dispatchEvent(new CustomEvent<ToastInput>(EVENT, { detail: input }));
}

export function Toaster() {
  const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastInput>).detail;
      setToast({ ...detail, id: Date.now() });
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), VISIBLE_MS);
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className="ui-toaster" aria-live="polite">
      {toast ? (
        <div key={toast.id} className="ui-toast" data-shell-bottom-obstruction>
          {toast.href ? <Link href={toast.href}>{toast.text}</Link> : toast.text}
        </div>
      ) : null}
    </div>
  );
}
