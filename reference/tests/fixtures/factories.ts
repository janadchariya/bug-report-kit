import { randomUUID } from 'node:crypto';
import type { Role } from '@/src/lib/roles';
import { normalizeCompanyName } from '@/src/lib/normalize';
import { db } from '@/src/server/db/client';
import { accounts, contacts, leads, type AccountRow, type ContactRow, type LeadRow } from '@/src/server/db/schema/crm';
import { users, type UserRow } from '@/src/server/db/schema/users';
export async function createUser(input: Partial<{ email: string; displayName: string; nickname: string | null; loginMethod: 'workspace' | 'personal_google'; roles: Role[]; status: 'active' | 'inactive'; googleSubject: string | null }> = {}): Promise<UserRow> {
  const id = randomUUID();
  const [row] = await db.insert(users).values({ email: `user-${id}@example.test`, displayName: `User ${id.slice(0,8)}`, loginMethod: 'workspace', roles: ['bd'], status: 'active', ...input }).returning();
  return row;
}
export async function createAccount(input: Partial<typeof accounts.$inferInsert> = {}): Promise<AccountRow> {
  const name = input.name ?? `Synthetic account ${randomUUID()}`;
  const [row] = await db.insert(accounts).values({ name, normalizedName: normalizeCompanyName(name), ...input }).returning(); return row;
}
export async function createContact(input: Partial<typeof contacts.$inferInsert> = {}): Promise<ContactRow> {
  const [row] = await db.insert(contacts).values({ fullName: 'Synthetic contact', ...input }).returning(); return row;
}
export async function createLead(input: Partial<typeof leads.$inferInsert> & { contact?: Partial<typeof contacts.$inferInsert> } = {}): Promise<LeadRow> {
  const { contact, ...values } = input;
  const primary = values.primaryContactId === undefined ? await createContact(contact) : null;
  const [row] = await db.insert(leads).values({ companyName: `Synthetic company ${randomUUID()}`, primaryContactId: primary?.id ?? null, ...values }).returning(); return row;
}
