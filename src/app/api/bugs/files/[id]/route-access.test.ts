import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Actor } from '@/src/server/auth/actor';
import { db } from '@/src/server/db/client';
import { bugReportFiles, bugReports } from '@/src/server/db/schema/bugs';
import { buildTestActor } from '@/tests/fixtures/actor';
import { createUser } from '@/tests/fixtures/factories';
import { truncateAll } from '@/tests/setup/truncate';

const mocks = vi.hoisted(() => ({ actor: vi.fn<() => Promise<Actor>>() }));
vi.mock('@/src/server/auth/guard', () => ({ requireActor: mocks.actor }));
import { GET } from './route';

beforeEach(truncateAll);
beforeEach(() => { vi.resetAllMocks(); });
it('returns 404 to a second reporter without disclosing PDF bytes or filename', async () => {
  const reporter = await buildTestActor((await createUser({ roles: ['bd'] })).id);
  const secondReporter = await buildTestActor((await createUser({ roles: ['bd'] })).id);
  const [report] = await db.insert(bugReports).values({ reporterUserId: reporter.userId, requestId: randomUUID(), summary: 'Synthetic private PDF', pagePath: '/', viewportWidth: 800, viewportHeight: 600, userAgent: '' }).returning();
  const content = Buffer.from('%PDF-1.7\n%%EOF');
  const [file] = await db.insert(bugReportFiles).values({ bugReportId: report.id, requestId: randomUUID(), kind: 'report_pdf', content, mimeType: 'application/pdf', fileName: 'synthetic-private.pdf', byteCount: content.length, uploadedByUserId: reporter.userId }).returning();
  const request = () => GET(new Request(`https://crm.test/api/bugs/files/${file.id}`), { params: Promise.resolve({ id: file.id }) });

  mocks.actor.mockResolvedValue(reporter);
  const ownResponse = await request();
  expect(ownResponse.status).toBe(200);
  expect(Buffer.from(await ownResponse.arrayBuffer())).toEqual(content);

  mocks.actor.mockResolvedValue(secondReporter);
  const denied = await request();
  expect(denied.status).toBe(404);
  expect(await denied.json()).toEqual({ error: 'not_found' });
  expect(denied.headers.get('Content-Disposition')).toBeNull();
  expect(denied.headers.get('Cache-Control')).toBe('private, no-store');
});
