import "server-only";

// Kit rate-limit.ts: the last allowed time per key, in this server instance's memory.

export type RateLimiter = { check(key: string): "allow" | "block" };

export function createRateLimiter({ windowMs, clock = Date.now }: { windowMs: number; clock?: () => number }): RateLimiter {
  const lastAt = new Map<string, number>();
  return {
    check(key) {
      const now = clock();
      const prev = lastAt.get(key);
      if (prev !== undefined && now - prev < windowMs) return "block";
      lastAt.set(key, now);
      if (lastAt.size > 5000) for (const [k, at] of lastAt) if (now - at >= windowMs) lastAt.delete(k);
      return "allow";
    },
  };
}
