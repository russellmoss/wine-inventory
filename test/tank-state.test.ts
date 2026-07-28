import { describe, it, expect } from "vitest";
import {
  tankState,
  TANK_STATES,
  TANK_STATE_LABEL,
  TANK_STATE_VARIANT,
  STALE_READING_HOURS,
  type TankStateInput,
} from "@/lib/vessels/tank-state";
import { STATUS_GLYPH } from "@/components/ui/status-variants";

const NOW = "2026-07-28T12:00:00.000Z";
const FRESH = "2026-07-28T09:00:00.000Z"; // 3h ago
const STALE = "2026-07-26T09:00:00.000Z"; // 51h ago

function input(over: Partial<TankStateInput> = {}): TankStateInput {
  return {
    hasWine: true,
    lots: [{ afState: "NONE", mlfState: "NONE" }],
    over: false,
    lastReadingAt: FRESH,
    now: NOW,
    ...over,
  };
}

describe("tankState", () => {
  it("an unoccupied vessel is empty", () => {
    expect(tankState(input({ hasWine: false, lots: [], lastReadingAt: null }))).toBe("empty");
  });

  it("empty wins even when stale readings and a finished ferment are on the record", () => {
    // A vessel that was racked out yesterday still has its old panels. It is empty, not aging.
    expect(tankState(input({ hasWine: false, lots: [{ afState: "DRY", mlfState: "NONE" }], lastReadingAt: STALE }))).toBe("empty");
  });

  it("an active alcoholic ferment with a fresh reading is fermenting", () => {
    expect(tankState(input({ lots: [{ afState: "ACTIVE", mlfState: "NONE" }] }))).toBe("fermenting");
  });

  it("an active malolactic ferment counts as fermenting too", () => {
    expect(tankState(input({ lots: [{ afState: "DRY", mlfState: "ACTIVE" }] }))).toBe("fermenting");
  });

  it("wine that is not fermenting is aging", () => {
    expect(tankState(input({ lots: [{ afState: "DRY", mlfState: "COMPLETE" }] }))).toBe("aging");
  });

  it("over capacity is attention", () => {
    expect(tankState(input({ over: true }))).toBe("attention");
  });

  it("attention beats fermenting when both fire", () => {
    // The precedence that matters: a person is needed before a description is.
    expect(tankState(input({ lots: [{ afState: "ACTIVE", mlfState: "NONE" }], over: true }))).toBe("attention");
  });

  it("a fermenting tank with no reading in 24h needs attention", () => {
    expect(tankState(input({ lots: [{ afState: "ACTIVE", mlfState: "NONE" }], lastReadingAt: STALE }))).toBe("attention");
  });

  it("a fermenting tank with NO reading at all needs attention, not a shrug", () => {
    expect(tankState(input({ lots: [{ afState: "ACTIVE", mlfState: "NONE" }], lastReadingAt: null }))).toBe("attention");
  });

  it("an aging tank with no readings is still just aging", () => {
    // Staleness only matters during a ferment. A barrel-aged wine is not overdue for Brix.
    expect(tankState(input({ lots: [{ afState: "DRY", mlfState: "NONE" }], lastReadingAt: null }))).toBe("aging");
  });

  it("honours a caller-supplied staleness window", () => {
    const i = input({ lots: [{ afState: "ACTIVE", mlfState: "NONE" }], lastReadingAt: FRESH, staleReadingHours: 1 });
    expect(tankState(i)).toBe("attention");
    expect(tankState({ ...i, staleReadingHours: 48 })).toBe("fermenting");
  });

  it("is exactly at, not over, the boundary at the window edge", () => {
    const exactly = new Date(Date.parse(NOW) - STALE_READING_HOURS * 3_600_000).toISOString();
    expect(tankState(input({ lots: [{ afState: "ACTIVE", mlfState: "NONE" }], lastReadingAt: exactly }))).toBe("fermenting");
    const oneMsPast = new Date(Date.parse(exactly) - 1).toISOString();
    expect(tankState(input({ lots: [{ afState: "ACTIVE", mlfState: "NONE" }], lastReadingAt: oneMsPast }))).toBe("attention");
  });

  it("an unparseable timestamp asks a human to look, rather than staying quiet", () => {
    // Fail TOWARDS attention. A garbage timestamp means we do not know when this tank was
    // last sampled, and "we don't know" on an active ferment is a reason to go and look.
    expect(tankState(input({ lots: [{ afState: "ACTIVE", mlfState: "NONE" }], lastReadingAt: "not-a-date" }))).toBe("attention");
  });

  it("a FUTURE-dated reading does not silence the tank forever", () => {
    // now - last is negative for a fat-fingered year or a skewed tablet clock. That used to
    // read as "not stale", permanently, so a stalled ferment kept a calm green chip.
    const future = new Date(Date.parse(NOW) + 86_400_000).toISOString();
    expect(tankState(input({ lots: [{ afState: "ACTIVE", mlfState: "NONE" }], lastReadingAt: future }))).toBe("attention");
  });

  it("ANY resident lot fermenting makes the tank fermenting", () => {
    // A 1000 L DRY lot beside a 900 L ACTIVE one is not "aging". Taking vesselLots[0] only
    // (the largest) reported an actively fermenting tank as resting.
    const i = input({ lots: [{ afState: "DRY", mlfState: "COMPLETE" }, { afState: "ACTIVE", mlfState: "NONE" }] });
    expect(tankState(i)).toBe("fermenting");
  });

  it("a vessel the ledger cannot account for is attention, never 'empty'", () => {
    // Composition on record with no occupancy, or an unusable capacity. Filing it under
    // Empty hands it to someone hunting for a free tank.
    expect(tankState(input({ hasWine: false, lots: [], unknown: true }))).toBe("attention");
  });

  it("is pure — same input, same answer, no clock read", () => {
    const i = input({ lots: [{ afState: "ACTIVE", mlfState: "NONE" }] });
    expect(tankState(i)).toBe(tankState(i));
  });
});

describe("AC-S24 — greyscale distinguishability", () => {
  it("every state has a label", () => {
    for (const s of TANK_STATES) expect(TANK_STATE_LABEL[s]).toBeTruthy();
  });

  it("every state maps to a DISTINCT glyph", () => {
    // This is AC-S24 asserted as data rather than as a screenshot: if two states ever
    // collapse onto the same glyph, colour becomes the only signal and the criterion fails.
    const glyphs = TANK_STATES.map((s) => STATUS_GLYPH[TANK_STATE_VARIANT[s]]);
    expect(new Set(glyphs).size).toBe(TANK_STATES.length);
  });

  it("every state maps to a DISTINCT label", () => {
    const labels = TANK_STATES.map((s) => TANK_STATE_LABEL[s]);
    expect(new Set(labels).size).toBe(TANK_STATES.length);
  });

  it("covers every state the deriver can return", () => {
    const produced = new Set<string>([
      tankState(input({ hasWine: false })),
      tankState(input({ lots: [{ afState: "ACTIVE", mlfState: "NONE" }] })),
      tankState(input({ lots: [{ afState: "DRY", mlfState: "NONE" }] })),
      tankState(input({ over: true })),
    ]);
    expect([...produced].sort()).toEqual([...TANK_STATES].sort());
  });
});
