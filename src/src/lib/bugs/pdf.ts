export const BUG_PDF_MAX_BYTES = 4 * 1024 * 1024;

const prohibitedPdfNames = new Set(['JavaScript', 'JS', 'Launch', 'EmbeddedFile', 'XFA', 'RichMedia']);

function isPdfWhitespace(character: string | undefined): boolean {
  return character === '\0' || character === '\t' || character === '\n' || character === '\f' || character === '\r' || character === ' ';
}

function isPdfDelimiter(character: string | undefined): boolean {
  return character === undefined || isPdfWhitespace(character) || '/<>[]()%'.includes(character);
}

function hasActivePdfName(text: string): boolean {
  let offset = 0;
  let afterDictionaryClose = false;
  while (offset < text.length) {
    const character = text[offset];
    if (isPdfWhitespace(character)) {
      offset++;
      continue;
    }
    if (character === '%') {
      while (offset < text.length && text[offset] !== '\r' && text[offset] !== '\n') offset++;
      continue;
    }
    if (character === '(') {
      afterDictionaryClose = false;
      let depth = 1;
      offset++;
      while (offset < text.length && depth > 0) {
        if (text[offset] === '\\') {
          offset += 2;
          continue;
        }
        if (text[offset] === '(') depth++;
        else if (text[offset] === ')') depth--;
        offset++;
      }
      continue;
    }
    if (character === '<') {
      afterDictionaryClose = false;
      offset++;
      if (text[offset] === '<') offset++;
      else {
        while (offset < text.length && text[offset] !== '>') offset++;
        if (offset < text.length) offset++;
      }
      continue;
    }
    if (character === '>' && text[offset + 1] === '>') {
      afterDictionaryClose = true;
      offset += 2;
      continue;
    }
    if (character === '/') {
      afterDictionaryClose = false;
      const start = ++offset;
      while (!isPdfDelimiter(text[offset])) offset++;
      // Decode within a name so escaped delimiters cannot split it into new tokens.
      const name = text.slice(start, offset).replace(/#([\da-f]{2})/gi, (_escape, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      if (prohibitedPdfNames.has(name)) return true;
      continue;
    }
    if (isPdfDelimiter(character)) {
      afterDictionaryClose = false;
      offset++;
      continue;
    }
    const start = offset;
    while (!isPdfDelimiter(text[offset])) offset++;
    const beginsStream = afterDictionaryClose && text.slice(start, offset) === 'stream';
    afterDictionaryClose = false;
    if (beginsStream) {
      // Stream bytes are opaque; only a delimited endstream ends this forward scan.
      // This deliberately does not decompress or inspect /ObjStm object streams.
      while (offset < text.length) {
        if (text.startsWith('endstream', offset) && isPdfDelimiter(text[offset - 1]) && isPdfDelimiter(text[offset + 9])) {
          offset += 9;
          break;
        }
        offset++;
      }
    }
  }
  return false;
}

/** Best-effort active-content screening, not a complete PDF parser or malware scanner. */
export function inspectBugPdf(content: Uint8Array): { mimeType: 'application/pdf'; byteCount: number } {
  if (content.byteLength < 5 || content.byteLength > BUG_PDF_MAX_BYTES) throw new Error('invalid_bug_pdf');
  const header = [37, 80, 68, 70, 45];
  if (!header.every((byte, index) => content[index] === byte)) throw new Error('invalid_bug_pdf');
  // Decode as single-byte characters so binary bytes cannot hide a literal token.
  let text = '';
  const chunk = 8192;
  for (let offset = 0; offset < content.length; offset += chunk) text += String.fromCharCode(...content.subarray(offset, offset + chunk));
  if (hasActivePdfName(text)) throw new Error('invalid_bug_pdf');
  return { mimeType: 'application/pdf', byteCount: content.byteLength };
}

export function sanitizeBugPdfFileName(name: string): string {
  const leaf = name.normalize('NFKC').split(/[\\/]/).at(-1) ?? '';
  const clean = leaf.replace(/[\p{Cc}\p{Cf}\p{Cs}"<>:|?*]+/gu, '_').replace(/^\.+|\.+$/g, '').trim();
  const stem = clean.replace(/\.[^.]*$/, '').trim() || 'attachment';
  return [...stem].slice(0, 196).join('') + '.pdf';
}
