import { readFileSync } from 'node:fs';
import { CHAT_MESSAGE_KINDS, CHAT_MESSAGE_SUBJECT_TYPES } from '@/src/server/google-chat/model';

it('widens only the two Chat CHECKs and keeps SQL aligned with the host model', () => {
  const migration = readFileSync('db/migrations/0002_bug_chat.sql', 'utf8');
  for (const [name, values] of [
    ['chat_messages_kind_known', CHAT_MESSAGE_KINDS], ['chat_messages_subject_type_known', CHAT_MESSAGE_SUBJECT_TYPES],
  ] as const) {
    const statement = migration.split('--> statement-breakpoint').find(part => part.includes(`ADD CONSTRAINT "${name}"`))!;
    expect([...statement.matchAll(/'([^']+)'/g)].map(match => match[1])).toEqual([...values]);
    expect(migration).toContain(`DROP CONSTRAINT "${name}"`);
  }
  const statements = migration.split('--> statement-breakpoint').map(part => part.trim()).filter(Boolean);
  expect(statements).toHaveLength(4);
  expect(statements.every(statement => /^ALTER TABLE "chat_messages" (?:DROP|ADD) CONSTRAINT "chat_messages_(?:kind|subject_type)_known"/.test(statement))).toBe(true);
});
