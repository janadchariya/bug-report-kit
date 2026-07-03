import { after } from "next/server";

/**
 * Run a notification AFTER the HTTP response is flushed, while keeping the
 * serverless function alive until it completes.
 *
 * Why this exists: notifications used to be dispatched as bare un-awaited
 * promises (`notifyX(...).catch(...)`) right before `return`. On Vercel the
 * function can freeze the instant the response is sent, suspending — or
 * dropping — that pending work. We observed a revision notification land
 * ~6.5 minutes late (after the employee had already re-submitted) because of
 * exactly this. `after()` registers the work with the runtime so the instance
 * stays alive until it settles.
 *
 * The work never blocks the response, and errors are swallowed (a flaky SMTP
 * server or revoked chat webhook must never surface to the user).
 *
 * Falls back to detached execution if called outside a request scope (e.g.
 * a cron/service context where `after()` is unavailable), so callers don't
 * have to care which context they're in.
 */
export function deferNotify(task: () => Promise<unknown>): void {
  const run = async () => {
    try {
      await task();
    } catch (err) {
      console.warn("[notify] deferred task failed:", err);
    }
  };
  try {
    after(run);
  } catch {
    // Not in a request scope — run detached rather than throw.
    void run();
  }
}
