// A timer that only runs while the page is visible (old host-transport useChangePolling and InboxBell): every
// `intervalMs` it calls `tick` when the document is visible; a hidden tab skips its turns, and coming back after a
// full interval or more ticks at once. Returns the stop function for a useEffect cleanup.

export type PollDocument = Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;

export type VisiblePollOptions = {
  intervalMs: number;
  /** Tick once straight away (when visible). */
  immediate?: boolean;
  doc?: PollDocument;
  now?: () => number;
};

export function startVisiblePoll(tick: () => void, { intervalMs, immediate = false, doc = document, now = Date.now }: VisiblePollOptions): () => void {
  let last = now();
  const visible = () => doc.visibilityState === "visible";
  const run = () => {
    last = now();
    tick();
  };
  const timer = setInterval(() => {
    if (visible()) run();
  }, intervalMs);
  const onVisibility = () => {
    if (visible() && now() - last >= intervalMs) run();
  };
  doc.addEventListener("visibilitychange", onVisibility);
  if (immediate && visible()) run();
  return () => {
    clearInterval(timer);
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
