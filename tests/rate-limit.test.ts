import { describe, it, expect, beforeEach } from "vitest";
import { createRateLimiter } from "../../lib/bugs/rate-limit";

describe("createRateLimiter", () => {
  let now = 0;
  const clock = () => now;

  beforeEach(() => {
    now = 1_000_000;
  });

  it("allows first request", () => {
    const limiter = createRateLimiter({ windowMs: 10_000, clock });
    expect(limiter.check("user-a")).toBe("allow");
  });

  it("blocks second request within window", () => {
    const limiter = createRateLimiter({ windowMs: 10_000, clock });
    expect(limiter.check("user-a")).toBe("allow");
    now += 5_000;
    expect(limiter.check("user-a")).toBe("block");
  });

  it("allows after window has passed", () => {
    const limiter = createRateLimiter({ windowMs: 10_000, clock });
    expect(limiter.check("user-a")).toBe("allow");
    now += 10_001;
    expect(limiter.check("user-a")).toBe("allow");
  });

  it("scopes per-user", () => {
    const limiter = createRateLimiter({ windowMs: 10_000, clock });
    expect(limiter.check("user-a")).toBe("allow");
    expect(limiter.check("user-b")).toBe("allow");
  });
});
