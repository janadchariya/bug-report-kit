import { SESSION_COOKIE_NAME } from '@/src/server/auth/session-cookie';
import { createDatabaseSession } from "@/src/server/auth/sessions";

let currentToken: string | null = null;

// Used as `vi.mock("next/headers", async () => (await import("@/tests/fixtures/as-actor")).nextHeadersMock)`.
export const nextHeadersMock = {
  cookies: async () => ({
    get: (name: string) => (name === SESSION_COOKIE_NAME && currentToken ? { name, value: currentToken } : undefined),
  }),
  headers: async () => new Headers(),
};

export async function asActor<T>(user: { id: string }, fn: () => Promise<T>): Promise<T> {
  const { sessionToken } = await createDatabaseSession(user.id, new Date());
  currentToken = sessionToken;
  try {
    return await fn();
  } finally {
    currentToken = null;
  }
}
