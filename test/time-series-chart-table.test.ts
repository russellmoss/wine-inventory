import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { code } from "./helpers/code";

const CHART = readFileSync(join(__dirname, "../src/components/ui/TimeSeriesChart.tsx"), "utf8");
const ANALYTE = readFileSync(join(__dirname, "../src/components/ui/AnalyteTrendChart.tsx"), "utf8");
const BRIX = readFileSync(join(__dirname, "../src/components/ui/BrixChart.tsx"), "utf8");

describe("AC-S25 — the data table is reachable, not only announceable", () => {
  it("offers a disclosure mode", () => {
    expect(CHART).toContain('tableVisibility?: "sr-only" | "disclosure"');
    expect(CHART).toContain("<details");
  });

  it("uses doc 10 §9's title", () => {
    expect(CHART).toContain('tableSummary = "Readings as a table"');
  });

  it("renders exactly ONE table node in either mode", () => {
    // Two nodes would duplicate the id the svg's aria-describedby points at, breaking the
    // association and reading the whole series out twice.
    expect(CHART.match(/<table /g) ?? []).toHaveLength(1);
    expect(CHART).toContain("const table = (");
  });

  it("drops sr-only from the table AND its caption in disclosure mode", () => {
    // A visible table with an sr-only caption is a table with no visible heading.
    expect(CHART).toContain('className={tableVisibility === "disclosure" ? undefined : "sr-only"}');
    expect(CHART.match(/tableVisibility === "disclosure" \? undefined : "sr-only"/g) ?? []).toHaveLength(2);
  });

  it("keeps data-rt so the global mobile table rule still cannot maul it", () => {
    expect(CHART).toContain('data-rt="scroll"');
  });

  it("keeps the svg wired to the table by id", () => {
    expect(CHART).toContain("aria-describedby={tableId}");
    expect(CHART).toContain("id={tableId}");
  });
});

describe("the change is additive — existing consumers are untouched", () => {
  it("defaults to the historical sr-only behaviour", () => {
    expect(CHART).toContain('tableVisibility = "sr-only"');
  });

  it("neither wrapper passes the new prop", () => {
    expect(code(ANALYTE)).not.toContain("tableVisibility");
    expect(code(BRIX)).not.toContain("tableVisibility");
  });

  it("AC-S26 still holds — dash and marker, not colour alone", () => {
    expect(CHART).toContain("strokeDasharray={enc.dash || undefined}");
    expect(CHART).toContain("const ENCODING");
    expect(CHART).toContain('marker: "triangle"');
  });

  it("an empty chart still short-circuits before rendering a table of nothing", () => {
    expect(CHART).toContain("if (withPoints.length === 0)");
  });
});
