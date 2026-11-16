import "server-only";

// The optional Google Chat message for a new report (kit notify-chat.ts notifyBugCreated). It never fails the report,
// and it is awaited for at most a few seconds so a serverless instance does not drop it after the response.

export type BugChat = (text: string) => Promise<void>;

const CHAT_TIMEOUT_MS = 5_000;

/** Posts `text` to the incoming webhook, or null when A10_BUG_CHAT_WEBHOOK_URL is not set. */
export function createBugChat(url: string | undefined, fetchImpl: typeof fetch = fetch): BugChat | null {
  if (!url) return null;
  return async (text) => {
    try {
      await fetchImpl(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ text }),
      });
    } catch {
      // Optional: the report is already saved.
    }
  };
}

/** The message text: who, the summary, the page, the first 500 characters of the details and the link. */
export function newBugText(bug: { summary: string; page_url: string; description: string | null }, reporter: string | null, link: string | null) {
  return [
    `*New bug report* from ${reporter ?? "someone"}`,
    bug.summary,
    `Page: ${bug.page_url}`,
    ...(bug.description ? [bug.description.slice(0, 500)] : []),
    ...(link ? [`Open: ${link}`] : []),
  ].join("\n");
}
