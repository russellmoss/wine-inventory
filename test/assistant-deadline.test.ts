import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEADLINE_NOTICE,
  TURN_BUDGET_MS,
  TURN_RESERVE_MS,
  hasRoomForAnotherRoundTrip,
} from "@/lib/assistant/deadline";

// Regression for the P0 "the assistant wont work for me, everything i type in gives an error
// message" report (feedback cmsdy4uom0006jp04iav07edp).
//
// Measured 2026-08-04 against the LIVE API with real tools and a real DB: a knowledge question that
// made three `search_knowledge_base` calls took 79.2s against a then-60s `maxDuration`. Past the
// ceiling Vercel kills the function MID-STREAM — run.ts's catch never runs, no assistant row is
// persisted, and nothing reaches Sentry, so the failure is invisible on both sides. These assert the
// loop winds itself up first and says so.

describe("assistant turn deadline", () => {
  it("leaves room for the reserve — the budget is not the deadline", () => {
    // The whole point: we must stop BEFORE the platform does, not at the same moment.
    expect(TURN_RESERVE_MS).toBeGreaterThan(0);
    expect(TURN_BUDGET_MS).toBeGreaterThan(TURN_RESERVE_MS);
  });

  it("allows another round-trip while there is room for one", () => {
    expect(hasRoomForAnotherRoundTrip(0)).toBe(true);
    expect(hasRoomForAnotherRoundTrip(TURN_BUDGET_MS - TURN_RESERVE_MS - 1)).toBe(true);
  });

  it("stops exactly when the next round-trip would not fit", () => {
    // Boundary: elapsed + reserve === budget is still allowed; one ms past it is not.
    expect(hasRoomForAnotherRoundTrip(TURN_BUDGET_MS - TURN_RESERVE_MS)).toBe(true);
    expect(hasRoomForAnotherRoundTrip(TURN_BUDGET_MS - TURN_RESERVE_MS + 1)).toBe(false);
  });

  it("stops once the budget is spent or overrun", () => {
    expect(hasRoomForAnotherRoundTrip(TURN_BUDGET_MS)).toBe(false);
    expect(hasRoomForAnotherRoundTrip(TURN_BUDGET_MS * 2)).toBe(false);
  });

  it("reproduces the measured 79.2s knowledge turn without tripping the deadline", () => {
    // The real failing turn cost 79,231ms across 3 KB searches. With the raised ceiling it must now
    // run to completion — if this ever returns false, the budget was tuned below a REAL observed
    // turn and knowledge questions are broken again.
    expect(hasRoomForAnotherRoundTrip(79_231)).toBe(true);
  });

  it("fails CLOSED on a broken clock", () => {
    // A bad elapsed value must wind up truthfully, never gamble on the silent kill.
    expect(hasRoomForAnotherRoundTrip(Number.NaN)).toBe(false);
    expect(hasRoomForAnotherRoundTrip(-1)).toBe(false);
    expect(hasRoomForAnotherRoundTrip(Number.POSITIVE_INFINITY)).toBe(false);
    expect(hasRoomForAnotherRoundTrip(10, Number.NaN)).toBe(false);
    expect(hasRoomForAnotherRoundTrip(10, TURN_BUDGET_MS, Number.NaN)).toBe(false);
  });

  it("the route's maxDuration still exceeds the budget it winds up inside", () => {
    // THE guard that would have caught this bug. The soft deadline only helps if the platform
    // ceiling is above it — with the old `maxDuration = 60` and a 240s budget, the loop would never
    // wind up and Vercel would kill the function mid-stream, exactly as it did in production.
    // Single-line regex on purpose: a newline-spanning assertion goes vacuous under CRLF checkouts.
    const route = readFileSync("src/app/api/assistant/route.ts", "utf8");
    const m = route.match(/^export const maxDuration = (\d+);/m);
    expect(m, "maxDuration must be declared in the assistant route").not.toBeNull();
    const maxDurationMs = Number(m![1]) * 1000;
    expect(maxDurationMs).toBeGreaterThan(TURN_BUDGET_MS);
  });

  it("tells the user the answer was cut short, without inventing a result", () => {
    expect(DEADLINE_NOTICE).toMatch(/ran out of time/i);
    expect(DEADLINE_NOTICE).toMatch(/what I got/i);
    // Must never claim success or that anything was saved.
    expect(DEADLINE_NOTICE).not.toMatch(/\b(done|completed|saved|created|filed)\b/i);
  });
});
