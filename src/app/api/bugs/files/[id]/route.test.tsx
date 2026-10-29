import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthenticationError, AuthorizationError, DomainRuleError } from '@/src/server/errors';

const mocks = vi.hoisted(() => ({ actor: vi.fn(), read: vi.fn(), error: vi.fn() }));
vi.mock('@/src/server/auth/guard', () => ({ requireActor: mocks.actor }));
vi.mock('@/src/server/bugs/files', () => ({ readBugPdf: mocks.read }));
vi.mock('@/src/server/db/client', () => ({ db: {} }));
vi.mock('@/src/server/logging/logger', () => ({ logger: { error: mocks.error } }));
import { GET } from './route';

const content = Buffer.from('%PDF-1.7\n%%EOF');
beforeEach(() => { vi.resetAllMocks(); mocks.actor.mockResolvedValue({ userId: 'synthetic' }); mocks.read.mockResolvedValue({ content, mimeType: 'application/pdf', byteCount: content.length, fileName: 'ทดสอบ.pdf' }); });
const request = (id: string = randomUUID()) => GET(new Request('https://crm.test/api/bugs/files/' + id), { params: Promise.resolve({ id }) });
it('returns only a private sandboxed PDF download with RFC5987 encoded filename', async () => {
  const result = await request();
  expect(result.status).toBe(200); expect(Buffer.from(await result.arrayBuffer())).toEqual(content);
  expect(result.headers.get('Content-Type')).toBe('application/pdf');
  expect(result.headers.get('Content-Disposition')).toBe("attachment; filename=\"attachment.pdf\"; filename*=UTF-8''" + encodeURIComponent('ทดสอบ.pdf'));
  expect(result.headers.get('Cache-Control')).toBe('private, no-store');
  expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(result.headers.get('Content-Security-Policy')).toBe('sandbox');
});
it('authenticates before resolving IDs and hides access/removal/missing uniformly', async () => {
  expect((await request('bad')).status).toBe(404); expect(mocks.read).not.toHaveBeenCalled();
  for (const error of [new AuthorizationError('forbidden'), new DomainRuleError('bug_not_visible')]) { mocks.read.mockRejectedValueOnce(error); expect((await request()).status).toBe(404); }
  mocks.actor.mockRejectedValueOnce(new AuthenticationError('session_missing')); expect((await request()).status).toBe(401);
});
it('logs an unexpected error class without attachment contents or filename', async () => {
  mocks.read.mockRejectedValueOnce(new Error('private-file-name.pdf'));
  const result = await request(); expect(result.status).toBe(500);
  expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('private-file-name');
});
