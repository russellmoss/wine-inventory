import { describe, expect, it } from "vitest";
import {
  POWDERY_INDEX_UNAVAILABLE_REASON,
  composeInfectionStatusCore,
  type InfectionEventRow,
} from "@/lib/spray/infection-read-core";
import { SPRAY_DECISION_REFUSAL, summarizeInfectionStatus } from "@/lib/assistant/tools/query-spray-decision";

function row(over: Partial<InfectionEventRow> = {}): InfectionEventRow {
  return {
    logicalEventId: "lie_1",
    blockId: "blk_1",
    blockLabel: "Block 1",
    pathogen: "POWDERY_MILDEW",
    hostOrgan: "LEAF",
    status: "OPEN",
    resolutionKind: "FIXED_WINDOW",
    infectionOccurredOn: "2026-05-01",
    symptomExpectedAt: "2026-05-06",
    symptomProjectionKind: "PROJECTED",
    infectiousExpectedAt: "2026-05-06",
    infectiousProjectionKind: "PROJECTED",
    expiresOn: "2026-05-15",
    evidenceSource: "SCOUTING_OBSERVATION",
    ...over,
  };
}

describe("infection-read-core — composition", () => {
  it("groups open events by block and counts them", () => {
    const dto = composeInfectionStatusCore({
      vineyardId: "vy_1",
      today: "2026-05-08",
      rows: [row(), row({ logicalEventId: "lie_2", blockId: "blk_2", blockLabel: "Block 2" })],
    });
    expect(dto.blocks).toHaveLength(2);
    expect(dto.totalOpen).toBe(2);
  });

  it("excludes CLOSED and VOID events from current state", () => {
    const dto = composeInfectionStatusCore({
      vineyardId: "vy_1",
      today: "2026-05-08",
      rows: [row({ status: "CLOSED" }), row({ logicalEventId: "lie_2", status: "VOID" })],
    });
    expect(dto.totalOpen).toBe(0);
    expect(dto.blocks).toHaveLength(0);
  });

  it("reports infectious once past the SHORT bound", () => {
    const dto = composeInfectionStatusCore({ vineyardId: "vy_1", today: "2026-05-08", rows: [row()] });
    expect(dto.blocks[0].openEvents[0].infectious).toBe(true);
    expect(dto.blocks[0].openEvents[0].plainState).toMatch(/source of inoculum/i);
  });

  it("reports still-incubating before the short bound, and does not call it safe", () => {
    const dto = composeInfectionStatusCore({ vineyardId: "vy_1", today: "2026-05-03", rows: [row()] });
    const ev = dto.blocks[0].openEvents[0];
    expect(ev.infectious).toBe(false);
    expect(ev.plainState).toMatch(/still incubating/i);
    // An incubating event is still an OPEN event — it must not vanish from the count.
    expect(dto.totalOpen).toBe(1);
  });

  // ── the degrade case: unknown must never render as "no" ────────────────────────────────────
  it("an unprojected transition is null, NOT false, and is surfaced as undetermined", () => {
    const dto = composeInfectionStatusCore({
      vineyardId: "vy_1",
      today: "2026-06-01",
      rows: [row({ resolutionKind: "UNKNOWN", infectiousExpectedAt: null, infectiousProjectionKind: "UNKNOWN", expiresOn: null })],
    });
    const ev = dto.blocks[0].openEvents[0];
    expect(ev.infectious).toBeNull();
    expect(ev.infectious).not.toBe(false); // false would read as "this block is safe"
    expect(dto.blocks[0].undeterminedCount).toBe(1);
    expect(ev.plainState).toMatch(/cannot say/i);
  });

  // ── SAFE-11: "what we don't know" is non-empty BY CONSTRUCTION ─────────────────────────────
  it("always carries the honesty block, even with zero events", () => {
    const dto = composeInfectionStatusCore({ vineyardId: "vy_1", today: "2026-05-08", rows: [] });
    expect(dto.honesty.powderyIndexAvailable).toBe(false);
    expect(dto.honesty.powderyIndexReason.length).toBeGreaterThan(0);
    expect(dto.honesty.scoutingCannotClear).toMatch(/does not clear/i);
    expect(dto.honesty.latentBoundsAreAnInterval).toMatch(/5 and 14 days/);
  });

  it("says plainly that there is no powdery risk index and why", () => {
    const dto = composeInfectionStatusCore({ vineyardId: "vy_1", today: "2026-05-08", rows: [] });
    expect(dto.honesty.powderyIndexReason).toMatch(/6-consecutive-hour/);
    expect(dto.honesty.powderyIndexReason).toMatch(/hourly weather \(S1\)/i);
  });
});

// ── Unit 8's payload test ──────────────────────────────────────────────────────────────────────
// verify:ai-native proves a tool IMPORTS a seam. It cannot prove the tool SERIALIZES anything, so
// an honesty field can be computed perfectly and never reach the model. This asserts on the actual
// payload shape (the pattern in test/phenology-tool-payload.test.ts).
describe("query_spray_decision — the payload the model actually receives", () => {
  const dto = composeInfectionStatusCore({ vineyardId: "vy_1", today: "2026-05-08", rows: [row()] });

  it("carries the hard refusal and never claims it can recommend a spray", () => {
    const payload = summarizeInfectionStatus(dto, "Demo Vineyard");
    expect(payload.canRecommendASpray).toBe(false);
    expect(payload.refusal).toBe(SPRAY_DECISION_REFUSAL);
  });

  it("the refusal names WHY it cannot answer, so the model does not invent a reason", () => {
    expect(SPRAY_DECISION_REFUSAL).toMatch(/registration/i);
    expect(SPRAY_DECISION_REFUSAL).toMatch(/re-entry|pre-harvest/i);
    expect(SPRAY_DECISION_REFUSAL).toMatch(/resistance/i);
    // And it points at the human + the legal authority rather than dead-ending.
    expect(SPRAY_DECISION_REFUSAL).toMatch(/PCA|farm advisor/i);
    expect(SPRAY_DECISION_REFUSAL).toMatch(/label/i);
  });

  it("the 'what we don't know' fields reach the payload, not just the DTO", () => {
    const payload = summarizeInfectionStatus(dto, "Demo Vineyard");
    expect(payload.whatWeDoNotKnow.powderyRiskIndex).toBe(POWDERY_INDEX_UNAVAILABLE_REASON);
    expect(payload.whatWeDoNotKnow.scoutingCannotClear).toMatch(/does not clear/i);
    expect(payload.whatWeDoNotKnow.latentPeriodIsAnInterval).toMatch(/SHORT end/);
  });

  it("preserves the tri-state infectious flag through serialization — null must survive as null", () => {
    const unknownDto = composeInfectionStatusCore({
      vineyardId: "vy_1",
      today: "2026-06-01",
      rows: [row({ resolutionKind: "UNKNOWN", infectiousExpectedAt: null, infectiousProjectionKind: "UNKNOWN", expiresOn: null })],
    });
    const payload = summarizeInfectionStatus(unknownDto, "Demo Vineyard");
    const serialized = JSON.parse(JSON.stringify(payload));
    expect(serialized.blocks[0].openEvents[0].possiblyInfectious).toBeNull();
    expect(serialized.blocks[0].weCouldNotDetermine).toBe(1);
  });

  it("a vineyard with nothing tracked still refuses and still explains itself (never a bare empty)", () => {
    const empty = composeInfectionStatusCore({ vineyardId: "vy_1", today: "2026-05-08", rows: [] });
    const payload = summarizeInfectionStatus(empty, "Demo Vineyard");
    expect(payload.openInfectionCount).toBe(0);
    expect(payload.canRecommendASpray).toBe(false);
    expect(payload.whatWeDoNotKnow.powderyRiskIndex.length).toBeGreaterThan(0);
  });
});
