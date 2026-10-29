import { requireActor } from "@/src/server/auth/guard";
import { readBugImage } from "@/src/server/bugs/images";
import { db } from "@/src/server/db/client";
import { AuthenticationError, AuthorizationError, DomainRuleError } from "@/src/server/errors";
import { logger } from "@/src/server/logging/logger";
import { safeErrorClass } from "@/src/server/logging/redact";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    if (!/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(id)) {
      return Response.json({ error: "not_found" }, { status: 404, headers });
    }
    const image = await readBugImage(db, { actor, imageId: id });
    const extension = image.mimeType === "image/png" ? "png" : image.mimeType === "image/jpeg" ? "jpg" : "webp";
    return new Response(new Uint8Array(image.content), { headers: { ...headers, "Content-Type": image.mimeType,
      "Content-Disposition": `inline; filename="bug-image.${extension}"` } });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: "unauthenticated" }, { status: 401, headers });
    if (error instanceof AuthorizationError || (error instanceof DomainRuleError && error.code === "bug_not_visible")) {
      return Response.json({ error: "not_found" }, { status: 404, headers });
    }
    logger.error({ event: "bug_image.failed", errorClass: safeErrorClass(error) });
    return Response.json({ error: "unavailable" }, { status: 500, headers });
  }
}
