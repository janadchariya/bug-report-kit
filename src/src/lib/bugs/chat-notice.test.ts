import { describe, expect, it } from 'vitest';
import { CHAT_MESSAGE_KINDS, CHAT_MESSAGE_SUBJECT_TYPES, NOTIFICATION_BY_KIND } from '@/src/server/google-chat/model';
import { bugChatDataSchema, makeBugChatData } from './chat-notice';

const id = '00000000-0000-4000-8000-000000000019';
const eventId = '00000000-0000-4000-8000-000000000020';

describe('private bug Chat projection', () => {
  it('registers all three bug kinds and the subject with ordinary notification behavior', () => {
    expect(CHAT_MESSAGE_SUBJECT_TYPES).toContain('bug_report');
    for (const kind of ['bug_reported', 'bug_replied', 'bug_status_changed'] as const) {
      expect(CHAT_MESSAGE_KINDS).toContain(kind);
      expect(NOTIFICATION_BY_KIND[kind as keyof typeof NOTIFICATION_BY_KIND]).toBe('default');
    }
  });

  it('projects only server IDs, approved fallback, status and audience', () => {
    const data = makeBugChatData({ reportId: id, eventId, status: 'new', audience: 'triager' });
    expect(data).toEqual({ reportId: id, eventId, summary: 'Bug report 00000000', status: 'new', audience: 'triager' });
    expect(bugChatDataSchema.safeParse(data).success).toBe(true);
  });

  it('rejects source free text, HTML, unknown fields, captured URLs and malformed IDs', () => {
    const data = makeBugChatData({ reportId: id, eventId, status: 'in_progress', audience: 'reporter' });
    for (const mutation of [
      { summary: 'Customer SyntheticCustomer 0800000000 customer@example.test' },
      { summary: '<b>Customer</b>' }, { description: 'private' }, { body: 'private' },
      { url: 'https://external.test/?customer=private' }, { reportId: '<script>' },
      { eventId: 'no' }, { status: 'unknown' }, { audience: 'everyone' },
    ]) expect(bugChatDataSchema.safeParse({ ...data, ...mutation }).success).toBe(false);
  });
});
