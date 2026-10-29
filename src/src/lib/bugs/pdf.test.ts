import { File } from 'node:buffer';
import { inspectBugPdf, sanitizeBugPdfFileName, BUG_PDF_MAX_BYTES } from './pdf';
import { validateBugPdf } from '@/src/server/bugs/pdf-validation';

const content = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
it('sniffs PDF bytes independently of MIME/extension and sanitizes a bounded filename', async () => {
  expect(inspectBugPdf(content)).toEqual({ mimeType: 'application/pdf', byteCount: content.length });
  expect(await validateBugPdf(new File([content], '../ชื่อลูกค้า\r\n".txt', { type: 'image/png' }))).toEqual({ content, mimeType: 'application/pdf', byteCount: content.length, fileName: 'ชื่อลูกค้า_.pdf' });
  expect(sanitizeBugPdfFileName('C:\\private\\test.pdf')).toBe('test.pdf');
  expect(sanitizeBugPdfFileName('')).toBe('attachment.pdf');
  expect([...sanitizeBugPdfFileName('ก'.repeat(250) + '.pdf')]).toHaveLength(200);
});
it('rejects non-PDF, empty, oversized, and every prohibited active-content token', () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from('prefix%PDF-1.7'), Buffer.alloc(BUG_PDF_MAX_BYTES + 1), ...['/JavaScript','/JS','/Launch','/EmbeddedFile','/XFA','/RichMedia'].map(token => Buffer.from(`%PDF-1.7\n${token}`))]) expect(() => inspectBugPdf(bytes)).toThrow();
  const maximum = Buffer.alloc(BUG_PDF_MAX_BYTES); content.copy(maximum);
  expect(inspectBugPdf(maximum).byteCount).toBe(BUG_PDF_MAX_BYTES);
});
it('ignores active-content-looking bytes inside PDF streams but still checks dictionaries after them', () => {
  const stream = '%PDF-1.7\n1 0 obj << /Length 24 >>\nstream\n/JS /JavaScript /Launch\nendstream\nendobj';
  expect(inspectBugPdf(Buffer.from(stream)).mimeType).toBe('application/pdf');
  expect(() => inspectBugPdf(Buffer.from(stream + '\n2 0 obj << /JS (alert) >> endobj'))).toThrow('invalid_bug_pdf');
});
it.each([
  '% stream\n/S /JavaScript /JS (x)\n% endstream',
  '(stream) /JS (x) (endstream)',
  '(stream\n) /JS (x) (endstream)',
  '/stream\n/JS\n/endstream',
  'stream\n/JS\nendstream',
  '<< >> 0 stream\n/JS\nendstream',
  '<< >> /stream\n/JS\nendstream',
  '<< >> (label) stream\n/JS\nendstream',
  '<< >> <00> stream\n/JS\nendstream',
  '<< >> upstream\n/JS\nendstream',
  '<< >> streamSuffix\n/JS\nendstream',
])('does not let non-stream syntax hide an active-content name: %j', body => {
  expect(() => inspectBugPdf(Buffer.from(`%PDF-1.7\n${body}`))).toThrow('invalid_bug_pdf');
});
it.each([
  '<< /Length 20 >>\nstream\n.../JS...\nendstream',
  '<< /Length 20 >> % stream in a comment\r\nstream\n/JS\nendstream',
  '<< /Length 20 >>stream\n/JS\nendstream',
  '<< /Length 20 >>\nstream /JS endstream',
  '<< /Length 20 >>\nstream\nupendstream /JS\nendstream',
  '<< /Length 20 >>\nstream\nendstreamSuffix /JS\nendstream',
])('skips only a delimited stream after a dictionary close: %j', body => {
  expect(inspectBugPdf(Buffer.from(`%PDF-1.7\n${body}`))).toMatchObject({ mimeType: 'application/pdf' });
});
it.each([
  '/endstream',
  '% endstream\n',
  '(endstream)',
  '<656e6473747265616d>',
])('checks active-content names after endstream text outside a stream: %j', prefix => {
  expect(() => inspectBugPdf(Buffer.from(`%PDF-1.7\n${prefix} /JS`))).toThrow('invalid_bug_pdf');
});
it.each([
  '% /JavaScript /JS\r\n<< /Type /Catalog >>',
  '% /JavaScript /JS\r<< /Type /Catalog >>',
  '(outer (inner /JS) /Launch)',
  String.raw`(escaped \) /JS and \( /Launch)`,
  '<2f4a53>',
])('ignores names inside PDF comments, nested literals, and hex strings: %j', body => {
  expect(inspectBugPdf(Buffer.from(`%PDF-1.7\n${body}`))).toMatchObject({ mimeType: 'application/pdf' });
});
it('ends an escaped-backslash literal before checking the next name', () => {
  expect(() => inspectBugPdf(Buffer.from(String.raw`%PDF-1.7
(escaped \\) /JS`))).toThrow('invalid_bug_pdf');
});
it('accepts harmless OpenAction destinations, form actions, and names that only share an active-content prefix', () => {
  const harmless = Buffer.from('%PDF-1.7\n<< /OpenAction [3 0 R /Fit] /AA << /URI (https://example.test) /SubmitForm null >> /JSText null /JavaScriptLabel null /LaunchSettings null /EmbeddedFiles null /XFALabel null /RichMediaPreview null >>');
  expect(inspectBugPdf(harmless)).toEqual({ mimeType: 'application/pdf', byteCount: harmless.length });
});
it.each(['/J#61vaScript', '/#4AS', '/La#75nch', '/Embedded#46ile', '/X#46A', '/Rich#4Dedia'])('rejects active-content PDF names with hex escapes: %s', token => {
  expect(() => inspectBugPdf(Buffer.from(`%PDF-1.7\n<< ${token} null >>`))).toThrow('invalid_bug_pdf');
});
it.each(['/JS#20', '/J#53#00', '/JavaScript#2fExtra', '/J#53Text'])('compares the entire decoded PDF name instead of splitting decoded delimiters: %s', token => {
  expect(inspectBugPdf(Buffer.from(`%PDF-1.7\n<< ${token} null >>`))).toMatchObject({ mimeType: 'application/pdf' });
});
it.each([' ', '\n', '/', '<', '>', '[', ']', '(', ')', '%', ''])('recognizes a prohibited name before the PDF delimiter %j', delimiter => {
  expect(() => inspectBugPdf(Buffer.from(`%PDF-1.7\n/JS${delimiter}`))).toThrow('invalid_bug_pdf');
});
it.each(['/S /JavaScript\0/JS\0(x)', '/J#61vaScript\0'])('rejects JavaScript action names separated by PDF NUL whitespace: %j', body => {
  expect(() => inspectBugPdf(Buffer.from(`%PDF-1.7\n${body}`))).toThrow('invalid_bug_pdf');
});
it.each(['\0', '\t', '\n', '\f', '\r', ' '])('uses PDF whitespace %j to delimit plain and escaped names', whitespace => {
  for (const name of ['/JS', '/J#61vaScript']) {
    expect(() => inspectBugPdf(Buffer.from(`%PDF-1.7\n${name}${whitespace}suffix`))).toThrow('invalid_bug_pdf');
  }
});
it.each(['\v', '\u00a0'])('keeps non-PDF JavaScript whitespace %j inside names', nonWhitespace => {
  const bytes = Buffer.from(`%PDF-1.7\n/JS${nonWhitespace}Suffix /J#61vaScript${nonWhitespace}Suffix`, 'latin1');
  expect(inspectBugPdf(bytes)).toEqual({ mimeType: 'application/pdf', byteCount: bytes.length });
});
it('uses NUL as a stream keyword delimiter', () => {
  expect(inspectBugPdf(Buffer.from('%PDF-1.7\n<< >>\0stream\0/JS\0endstream\0'))).toMatchObject({ mimeType: 'application/pdf' });
});
it.each(['\v', '\u00a0'])('does not use non-PDF whitespace %j to delimit stream keywords', nonWhitespace => {
  expect(() => inspectBugPdf(Buffer.from(`%PDF-1.7\n<< >>${nonWhitespace}stream\n/JS\nendstream`, 'latin1'))).toThrow('invalid_bug_pdf');
});
it.each(['\v', '\u00a0'])('does not use non-PDF whitespace %j to delimit endstream keywords', nonWhitespace => {
  expect(inspectBugPdf(Buffer.from(`%PDF-1.7\n<< >>\nstream\nendstream${nonWhitespace} /JS\nendstream`, 'latin1'))).toMatchObject({ mimeType: 'application/pdf' });
});
it('bounds the streaming read and refuses falsified size, malformed files, and absent files', async () => {
  await expect(validateBugPdf(null)).rejects.toMatchObject({ issues: [{ path: 'pdf', code: 'invalid_bug_pdf' }] });
  for (const file of [new File([], 'a.pdf'), new File([new Uint8Array(BUG_PDF_MAX_BYTES + 1)], 'a.pdf'), new File(['<svg/>'], 'a.pdf'), { size: content.length, stream: () => ({}) }]) await expect(validateBugPdf(file as File)).rejects.toThrow();
  const liar = new File([content], 'a.pdf');
  Object.defineProperty(liar, 'size', { value: 5 });
  await expect(validateBugPdf(liar)).rejects.toThrow();
});
