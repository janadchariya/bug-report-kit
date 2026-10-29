import 'server-only';
import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm';
import { db } from '@/src/server/db/client';
import { outboxJobs } from '@/src/server/db/schema/jobs';
import { handleChatMessageSend } from '@/src/server/google-chat/deliver-job';
import { logger } from '@/src/server/logging/logger';
import type { ClaimedJob } from './outbox';
/** Call on a protected cron as well: after() is a wake-up, the DB outbox is durable. */
export async function drainJobs(limit = 20): Promise<void> {
  for (let i = 0; i < limit; i++) {
    const now = new Date(), leaseOwner = randomUUID();
    const job = await db.transaction(async tx => {
      const [row] = await tx.select().from(outboxJobs).where(and(eq(outboxJobs.jobType, 'chat.message.send'), eq(outboxJobs.aggregateType, 'chat_message'),
        sql`exists (select 1 from public.chat_messages where id = ${outboxJobs.aggregateId} and subject_type = 'bug_report')`,
        lte(outboxJobs.availableAt, now), or(
        inArray(outboxJobs.status, ['pending','retryable_failed']), and(eq(outboxJobs.status, 'processing'), lte(outboxJobs.leaseExpiresAt, now)),
      ))).orderBy(asc(outboxJobs.availableAt)).limit(1).for('update', { skipLocked: true });
      if (!row) return null;
      const until = new Date(now.getTime()+60000), attemptCount = row.attemptCount+1;
      await tx.update(outboxJobs).set({ status: 'processing', leaseOwner, leaseExpiresAt: until, attemptCount, updatedAt: now }).where(eq(outboxJobs.id,row.id));
      return { ...row, attemptCount, leaseOwner, leaseExpiresAt: until.toISOString() } satisfies ClaimedJob;
    });
    if (!job) return;
    try {
      if (job.jobType !== 'chat.message.send') throw new Error('unsupported_job_kind');
      await handleChatMessageSend(job, new Date());
      await db.update(outboxJobs).set({ status:'succeeded', leaseOwner:null, leaseExpiresAt:null, updatedAt:new Date() }).where(and(eq(outboxJobs.id,job.id),eq(outboxJobs.leaseOwner,leaseOwner)));
    } catch {
      await db.update(outboxJobs).set({ status:job.attemptCount >= 8 ? 'dead' : 'retryable_failed', lastError:'delivery_failed', availableAt:new Date(Date.now()+Math.min(3600,2**job.attemptCount)*1000), leaseOwner:null, leaseExpiresAt:null, updatedAt:new Date() }).where(and(eq(outboxJobs.id,job.id),eq(outboxJobs.leaseOwner,leaseOwner)));
      logger.warn({ event:'bug.delivery_failed', jobId:job.id });
    }
  }
}
export function scheduleImmediateDrain(_correlationId: string): void { after(() => drainJobs()); }
