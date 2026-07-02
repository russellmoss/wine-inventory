import { describe, it, expect } from "vitest";
import { isCacheStale } from "@/lib/cost/cache";

// Unit 5 — the LAZY watermark cache staleness verdict (D4). Pure; the DB refresh path is exercised by
// verify:cost against the live schema.

describe("isCacheStale", () => {
  it("fresh when the watermark covers the latest cost op and policy version matches", () => {
    expect(isCacheStale(50, 50, 1, 1)).toBe(false);
    expect(isCacheStale(50, 40, 1, 1)).toBe(false); // no newer cost op than folded
  });

  it("stale when a newer cost-affecting op exists (a backdated ancestor edit bumps the max)", () => {
    expect(isCacheStale(50, 51, 1, 1)).toBe(true);
  });

  it("stale when the costing-policy version moved (a toggle/method change re-values)", () => {
    expect(isCacheStale(50, 50, 1, 2)).toBe(true);
    expect(isCacheStale(50, 40, 1, 2)).toBe(true);
  });

  it("a never-computed cache (watermark 0) is stale as soon as any cost op exists", () => {
    expect(isCacheStale(0, 1, 1, 1)).toBe(true);
    expect(isCacheStale(0, 0, 1, 1)).toBe(false); // no cost ops yet → nothing to fold
  });
});
