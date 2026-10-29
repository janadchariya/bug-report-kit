import { NextResponse } from 'next/server';
import { requireActor } from '@/src/server/auth/guard';
import { bugNavCounts } from '@/src/server/bugs/nav-counts';
import { db } from '@/src/server/db/client';
import { AuthenticationError, AuthorizationError } from '@/src/server/errors';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const counts = await bugNavCounts(db, { actor: await requireActor() });
    return NextResponse.json({ awaitingClaim: 0, overdue: 0, poolAwaiting: 0, ...counts }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : error instanceof AuthorizationError ? 403 : 500;
    return NextResponse.json({ error: 'nav_counts_unavailable' }, { status, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
