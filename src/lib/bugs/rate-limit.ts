/**
 * Tiny in-memory per-key rate limiter. Holds the timestamp of the last
 * allowed call per key. Fine for single-instance serverless functions on
 * Vercel where each invocation reuses warm memory. Upgrade to Redis if we
 * scale beyond that.
 */
type RateLimitOpts = {
  windowMs: number;
  clock?: () => number;
};

export type RateLimiter = {
  check(key: string): "allow" | "block";
};

export function createRateLimiter(opts: RateLimitOpts): RateLimiter {
  const lastAt = new Map<string, number>();
  const clock = opts.clock ?? Date.now;
  return {
    check(key) {
      const now = clock();
      const prev = lastAt.get(key);
      if (prev !== undefined && now - prev < opts.windowMs) {
        return "block";
      }
      lastAt.set(key, now);
      return "allow";
    },
  };
}

/** Singleton used by API handlers. 10-second window per user. */
export const bugSubmitLimiter = createRateLimiter({ windowMs: 10_000 });
