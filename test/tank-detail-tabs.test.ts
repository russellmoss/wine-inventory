import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { code } from "./helpers/code";

const ACTIONS = readFileSync(join(__dirname, "../src/app/(app)/bulk/CellarActions.tsx"), "utf8");
const PANEL = readFileSync(join(__dirname, "../src/app/(app)/bulk/TankFermentPanel.tsx"), "utf8");

describe("SC-11 — the five tabs", () => {
  it("ships Fermentation, Analyses, Tasting notes, History and Additions with the flag on", () => {
    for (const label of ["Fermentation", "Analyses", "Tasting notes", "History", "Additions"]) {
      expect(ACTIONS).toContain(`label: "${label}"`);
    }
  });

  it("Fermentation is the default tab", () => {
    expect(ACTIONS).toContain('defaultTab={NAV_V2_ENABLED ? "fermentation" : "history"}');
  });

  it("keeps the legacy three-tab set in the else arm", () => {
    // Rollback stays an env change, exactly like the board's.
    // Single-line fragments only: core.autocrlf=true checks .tsx out as CRLF on Windows, so
    // an assertion spanning a newline passes in CI and is vacuous locally. That is exactly
    // how test/shell-nav.test.ts's tab-bar guard went silently dead.
    expect(ACTIONS).toContain("tabs={");
    expect(ACTIONS).toContain("NAV_V2_ENABLED");
    expect(ACTIONS).toContain('{ id: "actions", label: "Actions", content: actionsTab },');
    expect(ACTIONS).toContain('{ id: "history", label: "History", content: historyTab },');
  });

  it("reuses Tabs, so every panel stays mounted", () => {
    // SC-11 requires it, and Tabs already behaves this way.
    expect(ACTIONS).toContain("<Tabs");
    expect(code(ACTIONS)).not.toContain("<Collapsible");
  });
});

describe("History and Additions come from ONE feed", () => {
  it("reuses the existing vessel timeline union rather than a second query", () => {
    // getVesselTimeline already unions LotOperation, LotTreatment, VesselActivityEvent,
    // AnalysisPanel and WorkOrderTask. R10 was already built; this consumes it.
    expect(ACTIONS).toContain("getVesselTimelineAction");
    expect(ACTIONS).toContain('matchesFilter(i, "additions")');
  });

  it("uses the same bucket logic the History chips use", () => {
    // So that "an addition" means exactly one thing on this page.
    expect(ACTIONS).toContain('from "@/lib/vessel/timeline-view"');
  });
});

describe("AC-S27 — the panel states numbers it did not compute", () => {
  it("renders only formatted strings from the facts object", () => {
    expect(PANEL).toContain("const f = facts.formatted;");
    for (const key of ["latestBrix", "brixDelta", "latestTemp", "tempDelta"]) {
      expect(PANEL).toContain(`f.${key}`);
    }
  });

  it("never formats a number itself", () => {
    // If toFixed appears here the invariant is already broken: there would be a second
    // derivation, and a second derivation is what AC-S27 forbids.
    expect(code(PANEL)).not.toContain("toFixed");
    expect(code(PANEL)).not.toContain("toLocaleString");
    expect(code(PANEL)).not.toContain("Math.round");
  });

  it("the chart's accessible name IS the same sentence the metrics are built from", () => {
    expect(PANEL).toContain("caption={facts.ariaSentence}");
  });

  it("AC-S25 — the chart carries its data table as a visible disclosure", () => {
    expect(PANEL).toContain('tableVisibility="disclosure"');
  });

  it("DM-44 — no yeast temperature floor line", () => {
    // Class D: yeast strain and its temperature range are not modelled. An annotation we
    // cannot source is exactly the kind that ends up contradicting the numbers.
    expect(code(PANEL)).not.toContain("thresholds");
  });

  it("reserves the chart height while loading rather than collapsing (SC-11)", () => {
    expect(PANEL).toContain('<Skeleton variant="block" height={180}');
  });

  it("uses doc 09's empty copy verbatim", () => {
    expect(PANEL).toContain("No readings yet for this tank");
    expect(PANEL).toContain("Record one and the curve appears here.");
  });
});

describe("no scope creep", () => {
  it("the detail adds no route — OD-P6-1 ratified modal-only", () => {
    expect(ACTIONS).toContain("<Modal");
    expect(code(ACTIONS)).not.toContain("router.push(`/bulk/");
  });

  it("the panel never writes", () => {
    expect(code(PANEL)).not.toContain("prisma");
    expect(code(PANEL)).not.toContain('"use server"');
  });

  it("no Mac glyphs", () => {
    expect(/[⌘⌥⌃⇧]/.test(code(ACTIONS))).toBe(false);
    expect(/[⌘⌥⌃⇧]/.test(code(PANEL))).toBe(false);
  });
});
