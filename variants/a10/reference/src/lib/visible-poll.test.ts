import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { startVisiblePoll, type PollDocument } from "./visible-poll";

function fakeDocument() {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  const set = (state: DocumentVisibilityState) => {
    doc.visibilityState = state;
    for (const listener of listeners) listener();
  };
  return { doc: doc as unknown as PollDocument, set, listeners };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("ticks every interval while visible", () => {
  const { doc } = fakeDocument();
  const tick = vi.fn();
  startVisiblePoll(tick, { intervalMs: 30_000, doc, now: Date.now });
  vi.advanceTimersByTime(29_999);
  expect(tick).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  vi.advanceTimersByTime(30_000);
  expect(tick).toHaveBeenCalledTimes(2);
});

test("a hidden tab skips its turns, and coming back after a full interval ticks at once", () => {
  const { doc, set } = fakeDocument();
  const tick = vi.fn();
  startVisiblePoll(tick, { intervalMs: 30_000, doc, now: Date.now });
  set("hidden");
  vi.advanceTimersByTime(120_000);
  expect(tick).not.toHaveBeenCalled();
  set("visible");
  expect(tick).toHaveBeenCalledTimes(1);
});

test("coming back before a full interval waits for the timer", () => {
  const { doc, set } = fakeDocument();
  const tick = vi.fn();
  startVisiblePoll(tick, { intervalMs: 30_000, doc, now: Date.now });
  set("hidden");
  vi.advanceTimersByTime(10_000);
  set("visible");
  expect(tick).not.toHaveBeenCalled();
});

test("immediate ticks once at the start, and stop removes the timer and the listener", () => {
  const { doc, listeners } = fakeDocument();
  const tick = vi.fn();
  const stop = startVisiblePoll(tick, { intervalMs: 60_000, immediate: true, doc, now: Date.now });
  expect(tick).toHaveBeenCalledTimes(1);
  stop();
  vi.advanceTimersByTime(600_000);
  expect(tick).toHaveBeenCalledTimes(1);
  expect(listeners.size).toBe(0);
});
