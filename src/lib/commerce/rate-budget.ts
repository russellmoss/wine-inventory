// Phase 16 Unit 2 — a per-tenant token-bucket rate budget. Commerce7 caps at 100 req/min/tenant; a
// single shared bucket per tenant slug throttles poll + refetch + UI on-demand fetch so the cap can't
// be blown (scale-register entry). In-memory + per-process (v1): bounded batches + cursor paging keep
// each tenant well under the cap within one serverless invocation; the bucket is the belt-and-braces.
// Pure + deterministic under injected clock/sleep (unit-tested).

export type RateBudgetDeps = { now?: () => number; sleep?: (ms: number) => Promise<void> };

const DEFAULT_PER_MIN = Number(process.env.COMMERCE7_RATE_PER_MIN) || 90; // headroom under 100

export class RateBudget {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly buckets = new Map<string, { tokens: number; last: number }>();

  constructor(perMinute: number = DEFAULT_PER_MIN, deps?: RateBudgetDeps) {
    this.capacity = Math.max(1, perMinute);
    this.refillPerMs = this.capacity / 60_000;
    this.now = deps?.now ?? Date.now;
    this.sleep = deps?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private refill(key: string): { tokens: number; last: number } {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, last: t };
    const elapsed = t - b.last;
    if (elapsed > 0) {
      b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerMs);
      b.last = t;
    }
    this.buckets.set(key, b);
    return b;
  }

  /** Acquire ONE token for `key` (the tenant slug), waiting the minimum time if the bucket is empty. */
  async acquire(key: string): Promise<void> {
    // Bounded loop: at most a few waits; each wait refills at least one token.
    for (let i = 0; i < 1000; i++) {
      const b = this.refill(key);
      if (b.tokens >= 1) {
        b.tokens -= 1;
        return;
      }
      const need = 1 - b.tokens;
      await this.sleep(Math.ceil(need / this.refillPerMs));
    }
    throw new Error("RateBudget.acquire exhausted its wait loop — refill misconfigured.");
  }
}

/** Process-wide shared budget keyed by tenant slug (all Commerce7 call sites share it). */
let shared: RateBudget | undefined;
export function sharedRateBudget(): RateBudget {
  if (!shared) shared = new RateBudget();
  return shared;
}
