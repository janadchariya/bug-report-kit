'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createBugInputSchema, commentBugInputSchema, updateBugInputSchema, markBugReadInputSchema, removeBugImageInputSchema, loadBugThreadInputSchema, attachBugPdfInputSchema, removeBugPdfInputSchema } from '@/src/lib/bugs/input';
import { db } from '@/src/server/db/client';
import { ValidationError } from '@/src/server/errors';
import { withAction } from '@/src/server/logging/action';
import { logger } from '@/src/server/logging/logger';
import { scheduleImmediateDrain } from '@/src/server/jobs/drain';
import { createBug, addBugComment, updateBug, markBugRead, removeBugImage } from '@/src/server/bugs/commands';
import { createBugContext } from '@/src/server/bugs/context';
import { validateBugImage } from '@/src/server/bugs/images';
import { loadBugThread } from '@/src/server/bugs/queries';
import { attachBugPdf, removeBugPdf } from '@/src/server/bugs/files';
import { validateBugPdf } from '@/src/server/bugs/pdf-validation';

function invalid(): never { throw new ValidationError([{ path:'bug',code:'invalid_bug_input' }]); }
function multipart(raw: unknown, allowed: readonly string[], fileKey = 'image'): { fields: Record<string,string>; image: File | null } {
  if (!(raw instanceof FormData)) invalid();
  const fields: Record<string,string> = {}; let image: File | null = null; const seen = new Set<string>();
  for (const [key,value] of raw.entries()) {
    if (!allowed.includes(key) || seen.has(key)) invalid();
    seen.add(key);
    if (key === fileKey) {
      if (typeof value === 'string') invalid();
      // An empty picker entry is the browser's representation of no attachment.
      if (value.size === 0 && value.name === '') continue;
      image = value;
    } else {
      if (typeof value !== 'string') invalid();
      if (value.length > 8192) invalid();
      fields[key] = value;
    }
  }
  return { fields, image };
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if(!result.success) invalid();return result.data; }
function refresh(bugId?: string) {
  revalidatePath('/bugs'); revalidatePath('/bugs/mine');
  if(bugId) { revalidatePath(`/bugs/${bugId}`);revalidatePath(`/bugs/mine/${bugId}`); }
  else { revalidatePath('/bugs/[id]', 'page');revalidatePath('/bugs/mine/[id]', 'page'); }
}
function wake(correlationId: string) {
  try { scheduleImmediateDrain(correlationId); }
  catch { logger.warn({ event:'bug.drain_schedule_failed',correlationId,errorClass:'schedule_failed' }); }
}
export const createBugAction = withAction({
  actionName:'bugs.createBugAction', permission:'bugs.report', schema:z.unknown(),
  handler:async(raw,actor,correlationId) => {
    const {fields,image:file} = multipart(raw,['requestId','summary','description','pathname','query','viewportWidth','viewportHeight','image']);
    const input = parse(createBugInputSchema,{...fields,viewportWidth:Number(fields.viewportWidth),viewportHeight:Number(fields.viewportHeight)});
    const image = await validateBugImage(file);
    const context = createBugContext(input,(await headers()).get('user-agent') ?? '',process.env.VERCEL_GIT_COMMIT_SHA);
    const result = await db.transaction(tx => createBug(tx,{actor,input:{requestId:input.requestId,summary:input.summary,description:input.description},context,image,now:new Date(),correlationId}));
    wake(correlationId);refresh(result.id);return result;
  },
});
export const addBugCommentAction = withAction({
  actionName:'bugs.addBugCommentAction',permission:null,schema:z.unknown(),
  handler:async(raw,actor,correlationId) => {
    const {fields,image:file} = multipart(raw,['bugId','requestId','body','image','pendingPdf']);
    const input = parse(commentBugInputSchema,fields); const image = await validateBugImage(file);
    const result = await db.transaction(tx => addBugComment(tx,{actor,bugId:input.bugId,input:{requestId:input.requestId,body:input.body,...(input.pendingPdf ? {pendingPdf:true} : {})},image,now:new Date(),correlationId}));
    wake(correlationId);refresh(input.bugId);return result;
  },
});
export const updateBugAction = withAction({actionName:'bugs.updateBugAction',permission:'bugs.triage',schema:updateBugInputSchema,handler:async(input,actor,correlationId)=>{
  const result = await db.transaction(tx=>updateBug(tx,{...input,actor,now:new Date(),correlationId}));wake(correlationId);refresh(input.bugId);return result;
}});
export const markBugReadAction = withAction({actionName:'bugs.markBugReadAction',permission:null,schema:markBugReadInputSchema,handler:async(input,actor)=>{
  const result = await db.transaction(tx=>markBugRead(tx,{...input,actor,now:new Date()}));refresh(input.bugId);return result;
}});
export const removeBugImageAction = withAction({actionName:'bugs.removeBugImageAction',permission:'bugs.triage',schema:removeBugImageInputSchema,handler:async(input,actor,correlationId)=>{
  const result = await db.transaction(tx=>removeBugImage(tx,{...input,actor,now:new Date(),correlationId}));wake(correlationId);refresh();return result;
}});
export const loadBugThreadAction = withAction({actionName:'bugs.loadBugThreadAction',permission:null,schema:loadBugThreadInputSchema,handler:async(input,actor)=>loadBugThread(db,{...input,actor})});
export const attachBugPdfAction = withAction({actionName:'bugs.attachBugPdfAction',permission:null,schema:z.unknown(),handler:async(raw,actor,correlationId)=>{
  const {fields,image:file} = multipart(raw,['bugId','commentId','requestId','pdf'],'pdf');
  const input = parse(attachBugPdfInputSchema,fields); const pdf = await validateBugPdf(file);
  const result = await db.transaction(tx=>attachBugPdf(tx,{...input,pdf,actor,now:new Date(),correlationId}));
  refresh(input.bugId);return result;
}});
export const removeBugPdfAction = withAction({actionName:'bugs.removeBugPdfAction',permission:'bugs.triage',schema:removeBugPdfInputSchema,handler:async(input,actor,correlationId)=>{
  const result = await db.transaction(tx=>removeBugPdf(tx,{...input,actor,now:new Date(),correlationId}));refresh();return result;
}});
