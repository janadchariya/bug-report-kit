import 'server-only';
import { eq } from 'drizzle-orm';
import type { Tx } from '@/src/server/db/client';
import { outboxJobs } from '@/src/server/db/schema/jobs';
export type ClaimedJob = { id: string; jobType: string; aggregateType: string; aggregateId: string | null; payload: Record<string, unknown>; dedupeKey: string; attemptCount: number; leaseOwner: string; leaseExpiresAt: string };
export async function enqueueJob(tx: Tx, input: { jobType: string; aggregateType: string; aggregateId: string | null; payload: Record<string, unknown>; dedupeKey: string; availableAt: Date }): Promise<{ id: string }> {
  const [row] = await tx.insert(outboxJobs).values(input).onConflictDoNothing({ target: outboxJobs.dedupeKey }).returning({ id: outboxJobs.id });
  if (row) return row;
  const [existing] = await tx.select({ id: outboxJobs.id }).from(outboxJobs).where(eq(outboxJobs.dedupeKey, input.dedupeKey)).limit(1); return existing;
}
