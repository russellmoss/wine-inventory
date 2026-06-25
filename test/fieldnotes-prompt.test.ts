import { describe, it, expect } from "vitest";
import { buildBriefingInput, BRIEFING_SYSTEM_PROMPT, parseBriefing } from "@/lib/fieldnotes/prompt";
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
  it("instructs the four analyses (section keys)", () => {
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/rain_vs_spray/);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/task_slippage/);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/leaf_conditions/);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/disease_pest/);
  });
  it("requires exactly 3 agenda items framed as questions", () => {
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/agenda/i);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/EXACTLY 3/);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/question/i);
  });
  it("instructs JSON-only structured output", () => {
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/JSON/);
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

describe("parseBriefing", () => {
  const good = JSON.stringify({
    headline: "Heavy rain after last week's spray.",
    agenda: [
      { priority: "high", question: "Does protectant coverage need refreshing after 300mm rain?" },
      { priority: "medium", question: "Which block does the magnesium note refer to?" },
      { priority: "low", question: "Any weed-control planned?" },
    ],
    sections: [
      {
        key: "rain_vs_spray",
        title: "Rain vs spray",
        items: [{ tone: "alert", text: "300mm rain, no spray logged.", block: "" }],
      },
      {
        key: "leaf_conditions",
        title: "Leaf conditions",
        items: [{ tone: "watch", text: "Yellowing reported.", block: "Block 4" }],
      },
    ],
  });

  it("parses a valid structured briefing", () => {
    const b = parseBriefing(good)!;
    expect(b.headline).toMatch(/Heavy rain/);
    expect(b.agenda).toHaveLength(3);
    expect(b.agenda[0].priority).toBe("high");
    expect(b.sections[1].items[0].block).toBe("Block 4");
  });

  it("returns null for legacy plain text (the UI falls back to text)", () => {
    expect(parseBriefing("Vineyard Bajo — Weekly Briefing\n- bullet")).toBeNull();
    expect(parseBriefing(null)).toBeNull();
    expect(parseBriefing("")).toBeNull();
  });

  it("returns null for JSON missing agenda/sections", () => {
    expect(parseBriefing(JSON.stringify({ headline: "x" }))).toBeNull();
  });

  it("coerces unknown enum values to safe defaults", () => {
    const b = parseBriefing(
      JSON.stringify({
        headline: "",
        agenda: [{ priority: "URGENT", question: "q?" }],
        sections: [{ key: "weird", title: "T", items: [{ tone: "boom", text: "t", block: "" }] }],
      }),
    )!;
    expect(b.agenda[0].priority).toBe("medium");
    expect(b.sections[0].key).toBe("task_slippage");
    expect(b.sections[0].items[0].tone).toBe("info");
  });
});
