import { z } from 'zod';

const uuid = z.uuid();
const status = z.enum(['new', 'in_progress', 'done', 'cancelled']);
const priority = z.enum(['low', 'medium', 'high', 'critical']);
const viewport = z.number().int().positive().max(16_384);
export const bugReasonSchema = z.string().trim().min(1).max(500);
export const createBugInputSchema = z.strictObject({
  requestId: uuid,
  summary: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  pathname: z.string().max(2048),
  query: z.string().max(8192).default(''),
  viewportWidth: viewport,
  viewportHeight: viewport,
});
export const commentBugInputSchema = z.strictObject({ bugId: uuid, requestId: uuid, body: z.string().trim().max(4000).nullable().optional(), pendingPdf: z.literal('true').optional() });
export const attachBugPdfInputSchema = z.strictObject({ bugId: uuid, commentId: uuid.optional(), requestId: uuid });
export const removeBugPdfInputSchema = z.strictObject({ fileId: uuid, reason: bugReasonSchema });
export const updateBugInputSchema = z.strictObject({
  bugId: uuid, expectedVersion: z.number().int().positive(),
  patch: z.strictObject({ status: status.optional(), priority: priority.nullable().optional(), assignedToUserId: uuid.nullable().optional() }),
  reason: bugReasonSchema.optional(),
});
export const markBugReadInputSchema = z.strictObject({ bugId: uuid, seenActivitySeq: z.number().int().nonnegative().max(2_147_483_647) });
export const removeBugImageInputSchema = z.strictObject({ imageId: uuid, reason: bugReasonSchema });
export const loadBugThreadInputSchema = z.strictObject({
  bugId: uuid, scope: z.enum(['triage', 'mine']),
  commentsBefore: z.string().max(512).optional(), historyBefore: z.string().max(512).optional(),
  limit: z.number().int().positive().max(100).optional(),
});
export type CreateBugInput = z.infer<typeof createBugInputSchema>;
export type CommentBugInput = z.infer<typeof commentBugInputSchema>;
