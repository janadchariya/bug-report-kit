import 'server-only';
import { sql } from 'drizzle-orm';
import type { Tx } from '@/src/server/db/client';
export const PRIVACY_MARKER = '[redacted]';
export const CONTACT_PRIVACY_STORES = {
  bug_reports: { classification: 'text', text: ['summary','description','page_path','page_query','user_agent'] },
  bug_report_comments: { classification: 'text', text: ['body'] },
  bug_report_status_changes: { classification: 'text', text: ['reason'] },
  bug_report_images: { classification: 'manual', text: ['removed_reason'] },
  bug_report_files: { classification: 'manual', text: ['file_name','removed_reason'] },
} as const;
export type ContactPrivacySubject = { contactId: string; personalTextVariants: readonly string[]; channelProbes: readonly { phones: readonly string[]; email: string | null; lineId: string | null }[]; externalRefs: readonly string[]; now: Date };
export type ScrubCounts = { stores: Record<string,number>; droppedVariants: number; sharedLeads: number; manualFollowUp: number };
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Strong identifiers only across arbitrary bug reports. Images/PDFs always need manual review. */
export async function scrubContactCopies(tx: Tx, subject: ContactPrivacySubject): Promise<ScrubCounts> {
  const values = subject.channelProbes.flatMap(probe => [...probe.phones, probe.email, probe.lineId]).filter((value): value is string => !!value);
  const patterns = [...new Set(values.map(value => value.normalize('NFKC').trim()).filter(Boolean))].sort((a,b) => b.length-a.length)
    .map(value => new RegExp(`(?<![0-9A-Za-z._@+\\-])${escape(value)}(?![0-9A-Za-z_@+\\-]|\\.[0-9A-Za-z_@+\\-])`, 'giu'));
  const scrub = (value: string) => patterns.reduce((text, pattern) => text.replace(pattern, PRIVACY_MARKER), value);
  const counts: ScrubCounts = { stores:{}, droppedVariants:subject.personalTextVariants.length, sharedLeads:0, manualFollowUp:0 };
  for (const [table, definition] of Object.entries(CONTACT_PRIVACY_STORES)) {
    const columns = definition.text;
    // Batch by stable UUID to avoid loading every bug report into application memory.
    let cursor: string | null = null;
    for (;;) {
      const rows: Record<string, unknown>[] = await tx.execute(sql`select ${sql.join(['id',...columns].map(column => sql.identifier(column)),sql`, `)} from ${sql.identifier(table)} where (${cursor}::uuid is null or id > ${cursor}::uuid) order by id limit 250`);
      if (!rows.length) break;
      for (const row of rows) {
        const changes: [string,string][] = [];
        for (const column of columns) {
          const original = row[column]; if (typeof original !== 'string') continue;
          let next = scrub(original);
          if (next === original) continue;
          if (definition.classification === 'manual') { counts.manualFollowUp++; break; }
          const limit = table === 'bug_reports' ? ({ summary:200,description:4000,user_agent:2048 } as Record<string,number>)[column] : table === 'bug_report_comments' ? 4000 : 500;
          if (limit) next = next.slice(0,limit);
          if (table === 'bug_reports' && column === 'page_path') next = '/';
          if (table === 'bug_reports' && column === 'page_query') next = '';
          changes.push([column,next]);
        }
        if (changes.length) {
          await tx.execute(sql`update ${sql.identifier(table)} set ${sql.join(changes.map(([column,value]) => sql`${sql.identifier(column)} = ${value}`),sql`, `)} where id = ${row.id}::uuid`);
          counts.stores[table] = (counts.stores[table] ?? 0)+1;
        }
      }
      cursor = String(rows.at(-1)!.id);
    }
  }
  return counts;
}
