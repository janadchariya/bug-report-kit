import type { NotifPrefs } from "@/lib/store/types";

export type NotifEvent = keyof NotifPrefs;

const DEFAULTS: Required<{
  [K in NotifEvent]: Required<NonNullable<NotifPrefs[K]>>;
}> = {
  // EMPLOYEE events — default: both ON (existing behavior)
  approved: { chat: true, email: true },
  rejected: { chat: true, email: true },
  revision: { chat: true, email: true },
  paid: { chat: true, email: true },
  // Pay-date change — in-app + chat only (no email by design); chat ON
  payDateChanged: { chat: true, email: false },
  // Employee FYI — was email-only; keep email ON, chat OFF as default
  sentForSignature: { chat: false, email: true },
  dupResult: { chat: true, email: true },
  // ACCOUNTING events — all ON
  newSubmission: { chat: true, email: true },
  accountCoding: { chat: true, email: true },
  mdApproved: { chat: true, email: true },
  // mdRejected was email-only (FYI); keep email ON, chat OFF
  mdRejected: { chat: false, email: true },
  // APPROVER events
  memoReady: { chat: true, email: true },
  // Reminder is opt-in (OFF by default)
  unsignedReminder: { chat: false, email: false, delayHours: 4 },
  // ADMIN + HR events — all ON
  newUser: { chat: true, email: true },
  adminDupRequest: { chat: true, email: true },
  // Bug reporter: chat ping on a new reply (email off — keep it lightweight)
  bugComment: { chat: true, email: false },
};

/** Merge stored prefs with defaults. Missing keys fall back to defaults. */
export function resolvePrefs(stored: NotifPrefs | undefined | null): typeof DEFAULTS {
  if (!stored) return DEFAULTS;
  const result = { ...DEFAULTS } as typeof DEFAULTS;
  for (const key of Object.keys(DEFAULTS) as NotifEvent[]) {
    const storedEvent = stored[key];
    if (storedEvent) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result[key] = { ...(DEFAULTS[key] as any), ...(storedEvent as any) };
    }
  }
  return result;
}

export function shouldSendChat(
  prefs: NotifPrefs | undefined | null,
  event: NotifEvent,
): boolean {
  return resolvePrefs(prefs)[event].chat as boolean;
}

export function shouldSendEmail(
  prefs: NotifPrefs | undefined | null,
  event: NotifEvent,
): boolean {
  return resolvePrefs(prefs)[event].email as boolean;
}
