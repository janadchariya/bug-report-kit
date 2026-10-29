import { requireActor } from '@/src/server/auth/guard';
import { readBugPdf } from '@/src/server/bugs/files';
import { db } from '@/src/server/db/client';
import { AuthenticationError, AuthorizationError, DomainRuleError } from '@/src/server/errors';
import { logger } from '@/src/server/logging/logger';
import { safeErrorClass } from '@/src/server/logging/redact';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox' };
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    if (!/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(id)) return Response.json({ error: 'not_found' }, { status: 404, headers });
    const file = await readBugPdf(db, { actor, fileId: id });
    const fileName = encodeURIComponent(file.fileName).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(new Uint8Array(file.content), { headers: { ...headers, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="attachment.pdf"; filename*=UTF-8''${fileName}` } });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: 'unauthenticated' }, { status: 401, headers });
    if (error instanceof AuthorizationError || (error instanceof DomainRuleError && error.code === 'bug_not_visible')) return Response.json({ error: 'not_found' }, { status: 404, headers });
    logger.error({ event: 'bug_pdf.failed', errorClass: safeErrorClass(error) });
    return Response.json({ error: 'unavailable' }, { status: 500, headers });
  }
}
