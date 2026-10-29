import { createBugInputSchema, commentBugInputSchema, updateBugInputSchema, markBugReadInputSchema } from './input';
const requestId = '11111111-1111-4111-8111-111111111111';
it('trims a bounded summary and permits summary-only reports', () => {
  const value = { requestId, summary: 'Bug', pathname: '/today', query: '', viewportWidth: 800, viewportHeight: 600 };
  expect(createBugInputSchema.safeParse(value).success).toBe(true);
  expect(createBugInputSchema.parse({ ...value, summary: '  Broken control  ' })).toMatchObject({ summary: 'Broken control' });
  for (const summary of ['', '   ', 'x'.repeat(201)]) expect(createBugInputSchema.safeParse({ ...value, summary }).success).toBe(false);
});
it('refuses oversized text and forged identity or build fields', () => {
  const value = { requestId, summary: 'Bug', pathname: '/today', query: '', viewportWidth: 800, viewportHeight: 600 };
  expect(createBugInputSchema.safeParse({ ...value, description: 'x'.repeat(4001) }).success).toBe(false);
  for (const extra of [{ actorId: requestId }, { appBuildSha: 'abc123' }, { userAgent: 'forged' }]) expect(createBugInputSchema.safeParse({ ...value, ...extra }).success).toBe(false);
});
it('bounds viewport, request IDs, comments, versions and read watermarks', () => {
  const value = { requestId, summary: 'Bug', pathname: '/today', query: '', viewportWidth: 800, viewportHeight: 600 };
  for (const width of [0, -1, 16385, 1.5]) expect(createBugInputSchema.safeParse({ ...value, viewportWidth: width }).success).toBe(false);
  expect(commentBugInputSchema.safeParse({ bugId: requestId, requestId, body: 'x'.repeat(4001) }).success).toBe(false);
  expect(updateBugInputSchema.safeParse({ bugId: requestId, expectedVersion: 0, patch: { status: 'done' } }).success).toBe(false);
  expect(updateBugInputSchema.safeParse({ bugId: requestId, expectedVersion: 1, patch: { status: 'unknown' } }).success).toBe(false);
  expect(markBugReadInputSchema.safeParse({ bugId: requestId, seenActivitySeq: -1 }).success).toBe(false);
});
