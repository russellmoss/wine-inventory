import { describe, it, expect } from "vitest";
import { buildBriefingInput, BRIEFING_SYSTEM_PROMPT } from "@/lib/fieldnotes/prompt";
import { type ParsedFieldNote, EMPTY_BLOCK_STATUS, DEFAULT_HEALTHY_BLOCK_STATUS } from "@/lib/fieldnotes/types";

function note(weekOf: string, over: Partial<ParsedFieldNote> = {}): ParsedFieldNote {
  return {
    id: `n-${weekOf}`,
    vineyardId: "v1",
    userId: "u1",
    userEmail: "mgr@bhutanwine.com",
    weekOf,
    weatherData: { rainfallMm: 0, maxTempC: 25, minTempC: 12 },
    spraysApplied: [],
    fertilizersApplied: [],
    blockLevelStatuses: { b1: { ...EMPTY_BLOCK_STATUS } },
    generalNotes: null,
    aiSummary: null,
    aiSummaryStatus: "PENDING",
    aiSummaryAt: null,
    schemaVersion: 1,
    createdAt: "2026-06-24T00:00:00.000Z",
    ...over,
  };
}

const labels = { b1: "Block 1", b2: "Block 2" };

describe("BRIEFING_SYSTEM_PROMPT", () => {
  it("frames Claude as a summarizer, not a diagnostician", () => {
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/SUMMARIZER, not a diagnostician/i);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/not issue definitive agronomic diagnoses/i);
  });
  it("instructs the four analyses", () => {
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/rain-vs-spray/i);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/task slippage/i);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/leaf condition/i);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/disease\/pest/i);
  });
  it("requires a 3-bullet agenda framed as questions", () => {
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/3-bullet agenda/i);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/exactly three bullets/i);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/question/i);
  });
});

describe("buildBriefingInput", () => {
  it("includes the vineyard name and week count", () => {
    const out = buildBriefingInput([note("2026-06-19")], "Paro Estate", labels);
    expect(out).toContain("Vineyard: Paro Estate");
    expect(out).toContain("Weeks in window (chronological, oldest first): 1");
  });

  it("orders weeks chronologically (oldest first) even when given newest-first", () => {
    const out = buildBriefingInput(
      [note("2026-06-26"), note("2026-06-12"), note("2026-06-19")],
      "Paro Estate",
      labels,
    );
    const i12 = out.indexOf("Week of 2026-06-12");
    const i19 = out.indexOf("Week of 2026-06-19");
    const i26 = out.indexOf("Week of 2026-06-26");
    expect(i12).toBeLessThan(i19);
    expect(i19).toBeLessThan(i26);
  });

  it("renders block labels, not raw ids", () => {
    const out = buildBriefingInput([note("2026-06-19")], "Paro Estate", labels);
    expect(out).toContain("Block 1:");
    expect(out).not.toContain("b1:");
  });

  it("describes sprays with scope and notes 'none logged' when blank", () => {
    const withSpray = note("2026-06-19", {
      spraysApplied: [{ name: "MANCOZEB", scope: "WHOLE", blockIds: [] }],
      fertilizersApplied: [],
    });
    const out = buildBriefingInput([withSpray], "Paro Estate", labels);
    expect(out).toContain("MANCOZEB (whole vineyard)");
    expect(out).toContain("Fertilizers: none logged");
  });

  it("surfaces a disease flag and leaf conditions", () => {
    const diseased = note("2026-06-19", {
      blockLevelStatuses: {
        b1: {
          ...DEFAULT_HEALTHY_BLOCK_STATUS,
          leafConditions: ["YELLOWING"],
          diseasePestSpotted: true,
          diseaseDescription: "mildew on lower leaves",
        },
      },
    });
    const out = buildBriefingInput([diseased], "Paro Estate", labels);
    expect(out).toMatch(/DISEASE\/PEST FLAGGED: mildew on lower leaves/);
    expect(out).toContain("leaf YELLOWING");
  });
});
