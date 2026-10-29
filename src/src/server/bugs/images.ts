import "server-only";
import { File as NodeFile } from "node:buffer";
import { eq } from "drizzle-orm";
import { BUG_IMAGE_MAX_BYTES } from "@/src/domain/bugs";
import { inspectBugImage, type InspectedBugImage } from "@/src/lib/bugs/image-metadata";
import type { Actor } from "@/src/server/auth/actor";
import type { DbOrTx } from "@/src/server/db/client";
import { bugReportImages } from "@/src/server/db/schema/bugs";
import { DomainRuleError, ValidationError } from "@/src/server/errors";
import { requireVisibleBug } from "./access";

export interface ValidatedBugImage extends InspectedBugImage { content: Buffer }
const invalid = (): never => { throw new ValidationError([{ path: "image", code: "invalid_bug_image" }]); };
const invisible = (): never => { throw new DomainRuleError("bug_not_visible"); };

/** A bounded read independent of client MIME, filename and claimed dimensions. */
export async function validateBugImage(file: File | NodeFile | null | undefined): Promise<ValidatedBugImage | null> {
  if (file == null) return null;
  if (!(file instanceof NodeFile) || file.size < 1 || file.size > BUG_IMAGE_MAX_BYTES) return invalid();
  const reader = file.stream().getReader();
  try {
    let byteCount = 0;
    const chunks: Buffer[] = [];
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      byteCount += next.value.byteLength;
      if (byteCount > BUG_IMAGE_MAX_BYTES || byteCount > file.size) {
        await reader.cancel(); return invalid();
      }
      chunks.push(Buffer.from(next.value));
    }
    if (byteCount !== file.size) return invalid();
    const content = Buffer.concat(chunks, byteCount);
    return { ...inspectBugImage(content), content };
  } catch {
    return invalid();
  } finally { reader.releaseLock(); }
}

/** Do not select binary content until the image's parent has passed authorization. */
export async function readBugImage(database: DbOrTx, input: { actor: Actor; imageId: string }): Promise<ValidatedBugImage> {
  const [metadata] = await database.select({ bugReportId: bugReportImages.bugReportId, removedAt: bugReportImages.removedAt })
    .from(bugReportImages).where(eq(bugReportImages.id, input.imageId)).limit(1);
  if (!metadata) return invisible();
  await requireVisibleBug(database, { actor: input.actor, bugId: metadata.bugReportId });
  if (metadata.removedAt) return invisible();
  const [row] = await database.select({ content: bugReportImages.content, mimeType: bugReportImages.mimeType, width: bugReportImages.width,
    height: bugReportImages.height, byteCount: bugReportImages.byteCount })
    .from(bugReportImages).where(eq(bugReportImages.id, input.imageId)).limit(1);
  if (!row?.content) return invisible();
  let inspected: InspectedBugImage;
  try { inspected = inspectBugImage(row.content); } catch { return invisible(); }
  if (inspected.mimeType !== row.mimeType || inspected.width !== row.width || inspected.height !== row.height || inspected.byteCount !== row.byteCount) return invisible();
  return { ...inspected, content: row.content };
}
