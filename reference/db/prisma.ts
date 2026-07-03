/**
 * Singleton Prisma client. Uses the @prisma/adapter-pg driver against the
 * Supabase Transaction Pooler (port 6543, pgbouncer) for runtime queries.
 *
 * Why a singleton: Next.js dev server reloads modules on file changes; if
 * we new'd up PrismaClient on every import we'd leak DB connections until
 * we hit the pooler's connection cap. The `globalThis.__PRISMA__` trick
 * keeps a single instance across reloads.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __PRISMA__: PrismaClient | undefined;
}

function makeClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient =
  globalThis.__PRISMA__ ?? (globalThis.__PRISMA__ = makeClient());
