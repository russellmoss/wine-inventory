import { describe, expect, it } from "vitest";
import {
  EMPTY_BLOCK_STATUS,
  DEFAULT_HEALTHY_BLOCK_STATUS,
  isUntouchedBlockStatus,
  parseBlockStatus,
  type BlockStatus,
} from "@/lib/fieldnotes/types";
import { buildBriefingInput } from "@/lib/fieldnotes/prompt";
import { summarizeBlock } from "@/lib/assistant/tools/query-field-reports";
import { summarizeBlockEdits } from "@/lib/assistant/tools/save-field-report";

// S4 Unit 4. Research found FIVE independent hardcoded projections of BlockStatus, each of which
// silently drops a field it doesn't list. This file is the net under all five.

const BLOCKS = [{ id: "b1", label: "Block 1" }];

function status(over: Partial<BlockStatus> = {}): BlockStatus {
  return { ...EMPTY_BLOCK_STATUS, ...over };
}

/** The briefing projection, reached through its real public entry point. */
function briefingLine(s: BlockStatus): string {
  return buildBriefingInput(
    [
      {
        id: "n1",
        vineyardId: "v1",
        userId: null,
        userEmail: "m@test",
        weekOf: "2026-07-20",
        weatherData: { rainfallMm: null, maxTempC: null, minTempC: null },
        spraysApplied: [],
        fertilizersApplied: [],
        blockLevelStatuses: { b1: s },
        generalNotes: null,
        aiSummary: null,
        aiSummaryStatus: "PENDING",
        aiSummaryAt: null,
        schemaVersion: 1,
        createdAt: "2026-07-20T00:00:00.000Z",
      },
    ],
    "QA Vineyard",
    { b1: "Block 1" },
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The council C2 regression: falsy-but-meaningful values must survive EVERY projection.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("falsy-but-meaningful values survive all five projections (council C2)", () => {
  it("hedgedThisWeek: false reaches the write-confirmation card", () => {
    const edits = summarizeBlockEdits({ b1: { hedgedThisWeek: false } }, BLOCKS);
    expect(edits.length).toBe(1);
    expect(edits[0]).toContain("not hedged this week");
    // The bug this pins: a truthiness gate produced NO edit line, so the card said
    // "no field changes" while a write was pending. The write happened; the preview denied it.
    expect(edits.join(" ")).not.toBe("");
  });

  it("shootLengthCm: 0 reaches the write-confirmation card", () => {
    const edits = summarizeBlockEdits({ b1: { shootLengthCm: 0 } }, BLOCKS);
    expect(edits[0]).toContain("0 cm");
  });

  it("REGRESSION (pre-existing bug): diseasePestSpotted: false reaches the card", () => {
    const edits = summarizeBlockEdits({ b1: { diseasePestSpotted: false } }, BLOCKS);
    expect(edits.length).toBe(1);
    expect(edits[0]).toContain("disease/pest cleared");
  });

  it("an untouched field produces NO line — undefined is still distinct from false/0", () => {
    expect(summarizeBlockEdits({ b1: {} }, BLOCKS)).toEqual([]);
  });

  it("falsy values reach the assistant read payload as themselves, not as null", () => {
    const p = summarizeBlock(status({ shootLengthCm: 0, hedgedThisWeek: false }));
    expect(p.shootLengthCm).toBe(0);
    expect(p.hedgedThisWeek).toBe(false);
  });

  it("falsy values reach the AI briefing", () => {
    const text = briefingLine(status({ shootLengthCm: 0, hedgedThisWeek: false }));
    expect(text).toContain("shoot length 0 cm");
    expect(text).toContain("not hedged this week");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Full round trip: every new field must appear in every projection.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const FULL = status({
  phenoStage: "VERAISON",
  phenoStagePct: 50,
  shootTip: "STAGNANT",
  shootLengthCm: 88,
  shootLengthBand: "GT_60",
  hedgedThisWeek: true,
  fruitZoneLeafRemoval: "PARTIAL",
  clusterDamage: "MODERATE",
  vinegarFlyPressure: "HIGH",
});

describe("a fully-populated status survives every projection", () => {
  it("produces a non-empty edit summary naming each new field", () => {
    const line = summarizeBlockEdits({ b1: FULL }, BLOCKS).join(" ");
    expect(line).toContain("88 cm");
    expect(line).toContain("over 60 cm");
    expect(line).toContain("hedged this week");
    expect(line).toContain("fruit-zone leaf removal partial");
    expect(line).toContain("cluster damage moderate");
    expect(line).toContain("vinegar-fly pressure high");
  });

  it("produces a briefing line naming each new field", () => {
    const text = briefingLine(FULL);
    expect(text).toContain("shoot length 88 cm");
    expect(text).toContain("HEDGED this week");
    expect(text).toContain("fruit-zone leaf removal PARTIAL");
    expect(text).toContain("cluster damage MODERATE");
    expect(text).toContain("vinegar-fly pressure HIGH");
  });

  it("produces a tool payload carrying each new field", () => {
    const p = summarizeBlock(FULL);
    expect(p.shootLengthCm).toBe(88);
    expect(p.shootLengthBand).toBe("GT_60");
    expect(p.hedgedThisWeek).toBe(true);
    expect(p.fruitZoneLeafRemoval).toBe("PARTIAL");
    expect(p.clusterDamage).toBe("MODERATE");
    expect(p.vinegarFlyPressure).toBe("HIGH");
  });

  it("the tool payload now carries shootTip, which it silently omitted before S4", () => {
    expect(summarizeBlock(FULL).shootTip).toBe("STAGNANT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// NOT_ASSESSED must never be relayed as a clean result.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("a scouting gap never renders as clean", () => {
  it("the tool payload flags an unscouted block in words the model cannot misread", () => {
    const p = summarizeBlock(status({ clusterDamage: "NOT_ASSESSED", vinegarFlyPressure: null }));
    expect(p.scoutingNote).toBeTruthy();
    expect(p.scoutingNote).toContain("NOBODY LOOKED");
    expect(p.scoutingNote).toContain("cluster damage");
    expect(p.scoutingNote).toContain("vinegar-fly pressure");
  });

  it("a genuinely scouted-clean block carries NO gap note", () => {
    const p = summarizeBlock(status({ clusterDamage: "NONE", vinegarFlyPressure: "NONE" }));
    expect(p.scoutingNote).toBeNull();
    expect(p.clusterDamage).toBe("NONE");
  });

  it("the briefing spells out that NOT_ASSESSED is not a clean result", () => {
    const text = briefingLine(status({ clusterDamage: "NOT_ASSESSED" }));
    expect(text).toContain("NOT ASSESSED");
    expect(text).toContain("not a clean result");
  });

  it("the confirmation card spells it out too", () => {
    const line = summarizeBlockEdits({ b1: { clusterDamage: "NOT_ASSESSED" } }, BLOCKS).join(" ");
    expect(line).toContain("nobody looked");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Back-compat: the exact 10-field JSON shape of the two live rows.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("legacy 10-field rows (back-compat, no historical migration)", () => {
  /** Byte-for-byte the shape stored by the two live field notes written before S4. */
  const LEGACY_ROW = {
    phenoStage: "FRUIT_SET",
    phenoStagePct: null,
    shootTip: "ACTIVE",
    canopyDensity: "MODERATE",
    waterStress: "NONE",
    weedPressure: "LOW",
    leafConditions: [],
    diseasePestSpotted: false,
    diseaseDescription: null,
    photoUrls: [],
  };

  it("parses without throwing and yields null for all six new fields", () => {
    const parsed = parseBlockStatus(LEGACY_ROW);
    expect(parsed.phenoStage).toBe("FRUIT_SET");
    expect(parsed.shootLengthCm).toBeNull();
    expect(parsed.shootLengthBand).toBeNull();
    expect(parsed.hedgedThisWeek).toBeNull();
    expect(parsed.fruitZoneLeafRemoval).toBeNull();
    expect(parsed.clusterDamage).toBeNull();
    expect(parsed.vinegarFlyPressure).toBeNull();
  });

  it("every pre-S4 field round-trips byte-identically", () => {
    const parsed = parseBlockStatus(LEGACY_ROW);
    for (const [k, v] of Object.entries(LEGACY_ROW)) {
      expect(parsed[k as keyof typeof parsed], k).toEqual(v);
    }
  });

  it("renders in all three read projections without inventing a value", () => {
    const parsed = parseBlockStatus(LEGACY_ROW);
    expect(summarizeBlock(parsed).clusterDamage).toBeNull();
    // A legacy row was never scouted, so it MUST carry the gap note.
    expect(summarizeBlock(parsed).scoutingNote).toContain("NOBODY LOOKED");
    expect(briefingLine(parsed)).not.toContain("cluster damage NONE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The untouched-block equality that adding keys used to break.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("isUntouchedBlockStatus", () => {
  it("an empty status is untouched", () => {
    expect(isUntouchedBlockStatus(EMPTY_BLOCK_STATUS)).toBe(true);
    expect(isUntouchedBlockStatus(undefined)).toBe(true);
  });

  it("survives extra unknown keys — the next field added must not re-break the healthy stamp", () => {
    const withStray = { ...EMPTY_BLOCK_STATUS, someFutureField: "x" } as unknown as BlockStatus;
    expect(isUntouchedBlockStatus(withStray)).toBe(true);
    // ...whereas the comparison this replaced would have called it edited:
    expect(JSON.stringify(withStray) === JSON.stringify(EMPTY_BLOCK_STATUS)).toBe(false);
  });

  it("detects a touched block via a new S4 field alone", () => {
    expect(isUntouchedBlockStatus(status({ shootLengthBand: "LT_10" }))).toBe(false);
    expect(isUntouchedBlockStatus(status({ hedgedThisWeek: false }))).toBe(false);
    expect(isUntouchedBlockStatus(status({ shootLengthCm: 0 }))).toBe(false);
  });

  it("detects a touched block via a pre-existing field", () => {
    expect(isUntouchedBlockStatus(status({ phenoStage: "VERAISON" }))).toBe(false);
  });
});

describe("the healthy baseline makes no scouting claim", () => {
  it("'mark remaining healthy' never asserts somebody walked the fruit zone", () => {
    expect(DEFAULT_HEALTHY_BLOCK_STATUS.clusterDamage).toBeNull();
    expect(DEFAULT_HEALTHY_BLOCK_STATUS.vinegarFlyPressure).toBeNull();
    expect(DEFAULT_HEALTHY_BLOCK_STATUS.clusterDamage).not.toBe("NONE");
  });

  it("and never fabricates a shoot measurement", () => {
    expect(DEFAULT_HEALTHY_BLOCK_STATUS.shootLengthCm).toBeNull();
    expect(DEFAULT_HEALTHY_BLOCK_STATUS.shootLengthBand).toBeNull();
    expect(DEFAULT_HEALTHY_BLOCK_STATUS.hedgedThisWeek).toBeNull();
  });
});
