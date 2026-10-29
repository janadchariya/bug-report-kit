import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
const ts = (name: string) => timestamp(name, { withTimezone: true });
export const accounts = pgTable('accounts', { id: uuid('id').primaryKey().defaultRandom(), name: text('name').notNull(), normalizedName: text('normalized_name') }).enableRLS();
export const contacts = pgTable('contacts', { id: uuid('id').primaryKey().defaultRandom(), fullName: text('full_name'), email: text('email'), phoneE164: text('phone_e164'), lineId: text('line_id'), isPrimary: boolean('is_primary').notNull().default(false) }).enableRLS();
export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(), companyName: text('company_name'), companyNameNormalized: text('company_name_normalized'),
  primaryContactId: uuid('primary_contact_id').references(() => contacts.id), ownerUserId: uuid('owner_user_id').references(() => users.id),
  submittedByUserId: uuid('submitted_by_user_id').references(() => users.id),
  services: text('services').array().notNull().default(sql`'{}'::text[]`), entryPoint: text('entry_point'), sourceKind: text('source_kind'), routingMode: text('routing_mode'),
  stage: text('stage').notNull().default('new'), grade: text('grade'), isLegacy: boolean('is_legacy').notNull().default(false),
  submittedAt: ts('submitted_at'), firstCustomerContactAt: ts('first_customer_contact_at'), firstRealContactAt: ts('first_real_contact_at'), stageChangedAt: ts('stage_changed_at'), claimedAt: ts('claimed_at'),
  archivedAt: ts('archived_at'), archiveReason: text('archive_reason'), updatedAt: ts('updated_at').notNull().defaultNow(),
}).enableRLS();
export type UserContact = typeof contacts.$inferSelect;
export type LeadRow = typeof leads.$inferSelect;
export type ContactRow = typeof contacts.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
