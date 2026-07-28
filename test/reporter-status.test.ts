import { describe, it, expect } from "vitest";
import { reporterStatus, type ReporterTone } from "@/lib/feedback/reporter-status";
import { STATUS_VARIANTS } from "@/components/ui/status-variants";

const VALID_TONES: readonly ReporterTone[] = STATUS_VARIANTS;

describe("reporterStatus", () => {
  it("maps every known lifecycle status to a labelled badge", () => {
    expect(reporterStatus("NEW")).toEqual({ label: "Open", tone: "neutral" });
    expect(reporterStatus("TRIAGED")).toEqual({ label: "Reviewing", tone: "neutral" });
    expect(reporterStatus("IN_PROGRESS")).toEqual({ label: "In progress", tone: "active" });
    expect(reporterStatus("RESOLVED")).toEqual({ label: "Resolved", tone: "done" });
    // DISMISSED is a CLOSED state, so it reads neutral, not `review` — `review` would
    // leave the reporter thinking a decision is still owed from them.
    expect(reporterStatus("DISMISSED")).toEqual({ label: "Reviewed, no change", tone: "neutral" });
  });

  it("surfaces both outcomes distinctly — a change made vs a deliberate no-change", () => {
    expect(reporterStatus("RESOLVED").label).not.toEqual(reporterStatus("DISMISSED").label);
  });

  it("falls back to a visible 'Open' badge for unknown/absent status", () => {
    for (const bad of ["", "WHATEVER", null, undefined]) {
      expect(reporterStatus(bad as string)).toEqual({ label: "Open", tone: "neutral" });
    }
  });

  it("only ever returns a valid status variant", () => {
    for (const s of ["NEW", "TRIAGED", "IN_PROGRESS", "RESOLVED", "DISMISSED", "???", "", null, undefined]) {
      expect(VALID_TONES).toContain(reporterStatus(s as string).tone);
    }
  });
});
