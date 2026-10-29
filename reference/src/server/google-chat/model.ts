export const BUG_CHAT_MESSAGE_KINDS = ['bug_reported', 'bug_replied', 'bug_status_changed'] as const;
export type BugChatMessageKind = typeof BUG_CHAT_MESSAGE_KINDS[number];
export function isBugChatKind(kind: string): kind is BugChatMessageKind {
  return (BUG_CHAT_MESSAGE_KINDS as readonly string[]).includes(kind);
}
export const CHAT_MESSAGE_KINDS = [
  "new_lead", "claimed_notice", "owner_lead", "claim_reminder", "contact_reminder",
  "md_no_claim", "md_missed_deadline", "md_grade_a", "duplicate_attached", "assigned_direct",
  "digest_0845", "digest_1330", "digest_1630", "md_digest_1730",
  "renewal_talk_due", "renewal_quote_due", "renewal_risk", "dispute_opened", "space_bind",
  ...BUG_CHAT_MESSAGE_KINDS,
] as const;
export type ChatMessageKind = (typeof CHAT_MESSAGE_KINDS)[number];

export const CHAT_ACTION_PURPOSES = [
  "lead.claim", "lead.pass", "lead.set_call_time", "contact.log", "followup.quick",
  "md.assign", "md.take", "renewal.set_status", "renewal.log",
] as const;
export type ChatActionPurpose = (typeof CHAT_ACTION_PURPOSES)[number];

export const CHAT_NOTIFICATIONS = ["default", "force", "silent"] as const;
export const CHAT_MESSAGE_STATUSES = ["pending", "reconciliation_required", "delivered", "superseded", "dead"] as const;
export const CHAT_SPACE_STATUSES = ["pending", "active", "disabled"] as const;
export const CHAT_MESSAGE_SUBJECT_TYPES = [
  "lead", "claim_offer", "follow_up", "renewal_task", "deadline_item", "dispute", "chat_space", "digest",
  'bug_report',
] as const;
export const CHAT_TOKEN_SUBJECT_TYPES = ["lead", "claim_offer", "follow_up", "renewal_task"] as const;

/** New Lead and bug notices use ordinary delivery; existing reminders/MD alarms retain their behavior. */
const FORCE_KINDS: readonly ChatMessageKind[] = ["claim_reminder", "contact_reminder", "md_no_claim", "md_missed_deadline"];
export const NOTIFICATION_BY_KIND: Readonly<Record<ChatMessageKind, (typeof CHAT_NOTIFICATIONS)[number]>> = Object.fromEntries(
  CHAT_MESSAGE_KINDS.map((kind) => [kind, kind === "new_lead" || isBugChatKind(kind) ? "default" : FORCE_KINDS.includes(kind) ? "force" : "silent"]),
) as Record<ChatMessageKind, (typeof CHAT_NOTIFICATIONS)[number]>;

const DAY = 86_400;
export const TOKEN_TTL_SECONDS: Readonly<Record<ChatActionPurpose, number>> = {
  "lead.claim": DAY,
  "lead.pass": DAY,
  "lead.set_call_time": 14 * DAY,
  "contact.log": 14 * DAY,
  "followup.quick": 14 * DAY,
  "md.assign": 14 * DAY,
  "md.take": 14 * DAY,
  "renewal.set_status": 45 * DAY,
  "renewal.log": 45 * DAY,
};

export function chatDedupeKey(kind: ChatMessageKind, subjectId: string | null, occurrence: string, recipientUserId: string): string {
  return `chat:${kind}:${subjectId}:${occurrence}:${recipientUserId}`;
}

export type ChatInteractionFunction = `google_chat.${ChatActionPurpose}` | "google_chat.space.bind";

export function interactionFunction(purpose: ChatActionPurpose): ChatInteractionFunction {
  return `google_chat.${purpose}`;
}

export function purposeOf(fn: ChatInteractionFunction): ChatActionPurpose | null {
  const purpose = fn.slice("google_chat.".length);
  return (CHAT_ACTION_PURPOSES as readonly string[]).includes(purpose) ? (purpose as ChatActionPurpose) : null;
}

/** "request" opens a dialog, "submit" accepts it, "none" acts on the button press itself. */
export type DialogPhase = "request" | "submit" | "none";
export const DIALOG_PHASES: Readonly<Record<ChatInteractionFunction, readonly DialogPhase[]>> = {
  "google_chat.lead.claim": ["request"],
  "google_chat.lead.pass": ["request", "submit"],
  "google_chat.lead.set_call_time": ["request", "submit"],
  "google_chat.contact.log": ["request", "submit"],
  "google_chat.followup.quick": ["none"],
  "google_chat.md.assign": ["none"],
  "google_chat.md.take": ["none"],
  "google_chat.renewal.set_status": ["request", "submit"],
  "google_chat.renewal.log": ["request", "submit"],
  "google_chat.space.bind": ["none"],
};
