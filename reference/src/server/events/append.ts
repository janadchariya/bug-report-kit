import "server-only";
import { sql } from "drizzle-orm";
import type { Actor } from "@/src/server/auth/actor";
import type { DbOrTx } from "@/src/server/db/client";
import { events } from "@/src/server/db/schema/events";
import { type ActorRef, EVENT_TYPES, type EventType, type SubjectType } from "./types";

export interface AppendEventInput {
  type: EventType;
  subjectType: SubjectType;
  subjectId: string;
  actor: ActorRef;
  payload?: Readonly<Record<string, unknown>>;
  reason?: string | null;
  correlationId: string;
  occurredAt: Date;
}

export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

const PERSONAL_KEYS = new Set([
  "lineDisplayName", "line_display_name", "phone", "phones", "phoneE164", "email", "lineId", "fullName", "contactName", "note", "rawText", "intakeRawText",
]);
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const THAI_PHONE_PATTERN = /^(?:\+66|0)\d{8,9}$/;
const KNOWN_TYPES: ReadonlySet<string> = new Set(EVENT_TYPES);

export function looksPersonal(value: string): boolean {
  return EMAIL_PATTERN.test(value) || THAI_PHONE_PATTERN.test(value.replace(/[\s\-()]/g, ""));
}

export function assertEventPayloadSafe(payload: unknown): void {
  const walk = (value: unknown, key: string): void => {
    if (typeof value === "string") {
      if (looksPersonal(value)) throw new Error(`event_payload_personal_data:${key}`);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
      return;
    }
    if (value && typeof value === "object") {
      for (const [childKey, childValue] of Object.entries(value)) {
        if (PERSONAL_KEYS.has(childKey)) throw new Error(`event_payload_personal_data:${childKey}`);
        walk(childValue, childKey);
      }
    }
  };
  walk(payload, "payload");
}

function actorColumns(actor: ActorRef): { actorKind: string; actorUserId: string | null } {
  return actor.kind === "system" ? { actorKind: "system", actorUserId: null } : { actorKind: actor.kind, actorUserId: actor.userId };
}

export async function appendEvent(db: DbOrTx, input: AppendEventInput): Promise<string> {
  if (!KNOWN_TYPES.has(input.type)) throw new Error("unknown_event_type");
  if (input.reason && /(?:https?:\/\/|Bearer\s)/i.test(input.reason)) throw new Error("event_reason_credential_risk");
  const payload = input.payload ?? {};
  assertEventPayloadSafe(payload);
  const [row] = await db
    .insert(events)
    .values({
      occurredAt: input.occurredAt,
      type: input.type,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      ...actorColumns(input.actor),
      payload: payload as Record<string, unknown>,
      reason: input.reason ?? null,
      correlationId: input.correlationId,
      // Keep successive subject events ordered across tied or backward wall-clock ticks.
      createdAt: sql`greatest(clock_timestamp(), coalesce((select max(${events.createdAt}) from ${events} where ${events.subjectType} = ${input.subjectType} and ${events.subjectId} = ${input.subjectId}), '-infinity'::timestamptz) + interval '1 microsecond')`,
    })
    .returning({ id: events.id });
  return row.id;
}

export function actorRef(actor: Actor, via: "web" | "google_chat" = "web"): ActorRef {
  return via === "google_chat" ? { kind: "google_chat", userId: actor.userId } : { kind: "user", userId: actor.userId };
}
