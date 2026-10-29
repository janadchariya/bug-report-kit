import 'server-only';
import { File as NodeFile } from 'node:buffer';
import { BUG_PDF_MAX_BYTES, inspectBugPdf, sanitizeBugPdfFileName } from '@/src/lib/bugs/pdf';
import { ValidationError } from '@/src/server/errors';

export type ValidatedBugPdf = { content: Buffer; mimeType: 'application/pdf'; byteCount: number; fileName: string };
const invalid = (): never => { throw new ValidationError([{ path: 'pdf', code: 'invalid_bug_pdf' }]); };

/** Bounded streaming read; never trusts client MIME, declared length or filename. */
export async function validateBugPdf(file: File | NodeFile | null | undefined): Promise<ValidatedBugPdf> {
  if (!(file instanceof NodeFile) || file.size < 1 || file.size > BUG_PDF_MAX_BYTES) return invalid();
  const reader = file.stream().getReader();
  try {
    let byteCount = 0;
    const chunks: Buffer[] = [];
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      byteCount += next.value.byteLength;
      if (byteCount > BUG_PDF_MAX_BYTES || byteCount > file.size) { await reader.cancel(); return invalid(); }
      chunks.push(Buffer.from(next.value));
    }
    if (byteCount !== file.size) return invalid();
    const content = Buffer.concat(chunks, byteCount);
    return { ...inspectBugPdf(content), content, fileName: sanitizeBugPdfFileName(file.name) };
  } catch { return invalid(); }
  finally { reader.releaseLock(); }
}
