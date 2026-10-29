import { z } from 'zod';
import { BUG_STATUSES } from '@/src/domain/bugs';

/** Finite, value-free projection: source titles, names and captured URLs never enter the outbox. */
export const bugChatDataSchema = z.strictObject({
  reportId: z.uuid(), eventId: z.uuid(), summary: z.string(),
  status: z.enum(BUG_STATUSES), audience: z.enum(['triager', 'reporter']),
}).refine(data => data.summary === `Bug report ${data.reportId.slice(0, 8)}`, { path: ['summary'], message: 'bug_chat_summary_invalid' });
export type BugChatData = z.infer<typeof bugChatDataSchema>;

export function makeBugChatData(input: Omit<BugChatData, 'summary'>): BugChatData {
  return bugChatDataSchema.parse({ ...input, summary: `Bug report ${input.reportId.slice(0, 8)}` });
}
