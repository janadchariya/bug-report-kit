/**
 * Google Chat notification helper (Incoming Webhook style).
 *
 * Each user can paste their personal "Notifications" space webhook URL
 * into the profile page — when they receive notifications, we POST a card
 * to that URL.
 *
 * Webhook URL format:
 *   https://chat.googleapis.com/v1/spaces/SPACE_ID/messages?key=...&token=...
 *
 * No auth needed — the URL itself is the secret. Errors are caught and
 * logged so chat failures never block the primary action.
 */

/**
 * Single source of truth for "does this user have a usable chat webhook?".
 * Whitespace-only counts as not set. Used by the app layout (onboarding gate)
 * and the onboarding checklist so both agree.
 */
export function isChatWebhookSet(url?: string | null): boolean {
  return typeof url === "string" && url.trim().length > 0;
}

export type ChatCardSection = {
  /** Optional header above the section. */
  header?: string;
  /** Key-value pairs displayed as "label : value" rows. */
  fields?: { label: string; value: string }[];
  /** Inline text paragraph(s). */
  text?: string;
};

export type ChatCard = {
  /** Title at the top of the card. */
  title: string;
  /** Subtitle under the title. */
  subtitle?: string | null;
  /** Image URL (e.g. ANGA logo) shown next to the title. */
  imageUrl?: string;
  sections: ChatCardSection[];
  /** Buttons at the bottom (e.g. "เปิดดูรายละเอียด"). */
  buttons?: { text: string; url: string }[];
};

export type ChatSendResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Send a Google Chat card to an incoming webhook URL.
 *
 * Webhooks accept either a plain `{ text }` message or a structured `cardsV2`
 * payload. We use cardsV2 because it gives a richer layout for approval
 * notifications.
 */
export async function sendChatCard(
  webhookUrl: string,
  card: ChatCard,
): Promise<ChatSendResult> {
  if (!webhookUrl || !webhookUrl.startsWith("https://chat.googleapis.com/")) {
    return { ok: false, error: "invalid_webhook" };
  }

  // Build each section's widgets, dropping fields with empty values so we never
  // emit a `decoratedText` with null/empty text.
  const sectionWidgets = (s: ChatCardSection) => [
    ...(s.text && s.text.trim() ? [{ textParagraph: { text: s.text } }] : []),
    ...(s.fields ?? [])
      .filter((f) => f.value != null && String(f.value).trim().length > 0)
      .map((f) => ({
        decoratedText: { topLabel: f.label, text: String(f.value), wrapText: true },
      })),
  ];

  // Keep only sections that actually have widgets — a cardsV2 section with an
  // empty `widgets` array renders as a blank message in Google Chat.
  const sections: Array<{ header?: string; widgets: unknown[] }> = card.sections
    .map((s) => ({
      ...(s.header ? { header: s.header } : {}),
      widgets: sectionWidgets(s),
    }))
    .filter((s) => s.widgets.length > 0);

  if (card.buttons && card.buttons.length > 0) {
    sections.push({
      widgets: [
        {
          buttonList: {
            buttons: card.buttons.map((b) => ({
              text: b.text,
              onClick: { openLink: { url: b.url } },
            })),
          },
        },
      ],
    });
  }

  // Fallback: if a card somehow has no renderable content, send plain text so
  // the recipient never gets an empty bubble.
  const payload =
    sections.length > 0
      ? {
          cardsV2: [
            {
              cardId: `expense-${Date.now()}`,
              card: {
                header: {
                  title: card.title,
                  ...(card.subtitle ? { subtitle: card.subtitle } : {}),
                  ...(card.imageUrl
                    ? { imageUrl: card.imageUrl, imageType: "CIRCLE" }
                    : {}),
                },
                sections,
              },
            },
          ],
        }
      : { text: card.subtitle ? `${card.title}\n${card.subtitle}` : card.title };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[chat] ${res.status} ${res.statusText}: ${body}`);
      return { ok: false, error: `${res.status} ${res.statusText}` };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[chat] send failed:", message);
    return { ok: false, error: message };
  }
}

/** Fire-and-forget — just text body, no card. */
export async function sendChatText(
  webhookUrl: string,
  text: string,
): Promise<ChatSendResult> {
  if (!webhookUrl || !webhookUrl.startsWith("https://chat.googleapis.com/")) {
    return { ok: false, error: "invalid_webhook" };
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      return { ok: false, error: `${res.status} ${res.statusText}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
