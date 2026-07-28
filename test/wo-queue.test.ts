/**
 * Phase 5 — SavedViews + Narrow, and the derived StageIndicator
 * (v2 §B16, §B24).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  builtInViews,
  chipRemoveLabel,
  chipsFromParams,
  isViewActive,
  resultSummary,
  toQueryString,
  withoutChip,
} from "@/lib/work-orders/narrow";
import { STAGES, deriveStages, stageSummary } from "@/lib/work-orders/stage";

const INDICATOR = readFileSync(
  fileURLToPath(new URL("../src/components/ui/StageIndicator.tsx", import.meta.url)),
  "utf8",
);

describe("SavedViews (v2 §B16)", () => {
  it("puts 'Mine, today' first — the first question of the morning", () => {
    expect(builtInViews("a@b.c")[0].id).toBe("mine-today");
  });

  it("degrades to an empty filter when there is no signed-in email", () => {
    // Better to show everything than to silently filter on `undefined` and
    // render an empty queue that looks like "you have no work".
    expect(builtInViews(null)[0].params).toEqual({});
  });

  it("recognises the active view exactly, not loosely", () => {
    const views = builtInViews("a@b.c");
    const mine = views[0];
    expect(isViewActive(mine, { assignee: "a@b.c" })).toBe(true);
    // An EXTRA narrowing means the saved view is no longer what you are looking at.
    expect(isViewActive(mine, { assignee: "a@b.c", status: "ISSUED" })).toBe(false);
    expect(isViewActive(mine, {})).toBe(false);
  });

  it("treats 'All open' as active only when nothing is narrowed", () => {
    const all = builtInViews("a@b.c").find((v) => v.id === "all-open")!;
    expect(isViewActive(all, {})).toBe(true);
    expect(isViewActive(all, { status: "ISSUED" })).toBe(false);
  });
});

describe("Narrow chips", () => {
  it("orders chips predictably regardless of param order", () => {
    const chips = chipsFromParams({ to: "2026-08-01", q: "rack", status: "ISSUED" });
    expect(chips.map((c) => c.kind)).toEqual(["q", "status", "to"]);
  });

  it("ignores empty params", () => {
    expect(chipsFromParams({ status: "", assignee: undefined })).toEqual([]);
  });

  it("humanises the value a person actually reads", () => {
    expect(chipsFromParams({ status: "PENDING_APPROVAL" })[0].label).toBe("Status: pending approval");
    expect(chipsFromParams({ assignee: "none" })[0].label).toBe("Assignee: nobody");
  });

  it("names what REMOVING the chip does, not what it is", () => {
    // "Status: issued" tells a screen-reader user nothing about the button they
    // are focused on.
    const [chip] = chipsFromParams({ status: "ISSUED" });
    expect(chipRemoveLabel(chip)).toBe("Remove status filter — showing every status");
  });

  it("removes exactly one chip and leaves the rest", () => {
    const next = withoutChip({ status: "ISSUED", assignee: "a@b.c" }, "status");
    expect(next).toEqual({ assignee: "a@b.c" });
  });

  it("round-trips through the URL, dropping empties", () => {
    expect(toQueryString({ status: "ISSUED", assignee: "" })).toBe("?status=ISSUED");
    expect(toQueryString({})).toBe("");
  });
});

describe("the result count (announced in aria-live)", () => {
  it("distinguishes 'nothing exists' from 'your filters excluded everything'", () => {
    // The old bar rendered a full filter panel above an empty list, which reads
    // as "the app is broken" rather than "you narrowed too far".
    expect(resultSummary(0, [])).toBe("No open work orders.");
    expect(resultSummary(0, chipsFromParams({ status: "ISSUED" }))).toContain("Remove one to widen");
  });

  it("gets singular and plural right", () => {
    expect(resultSummary(1, [])).toBe("1 open work order.");
    expect(resultSummary(4, [])).toBe("4 open work orders.");
    expect(resultSummary(1, chipsFromParams({ q: "x" }))).toBe("1 work order match.");
  });
});

describe("StageIndicator is DERIVED (v2 §B24)", () => {
  it("has the six stages in production order", () => {
    expect([...STAGES]).toEqual(["harvest", "ferment", "press", "age", "blend", "bottle"]);
  });

  it("marks a stage recorded only when an op evidences it", () => {
    const s = deriveStages(["CRUSH"]);
    expect(s.find((x) => x.stage === "ferment")!.recorded).toBe(true);
    expect(s.find((x) => x.stage === "press")!.recorded).toBe(false);
  });

  it("takes the FURTHEST stage as current, not the most recent op", () => {
    // You top a blended wine all the time. A topping (age) logged after a blend
    // must not drag the lot backwards.
    const s = deriveStages(["BLEND", "TOPPING"]);
    expect(s.find((x) => x.current)!.stage).toBe("blend");
  });

  it("ignores operation types it does not recognise", () => {
    expect(deriveStages(["SOMETHING_NEW"]).every((s) => !s.recorded)).toBe(true);
  });

  it("says so plainly when nothing is recorded", () => {
    expect(stageSummary(deriveStages([]))).toBe("No production stage recorded yet.");
  });

  it("summarises current stage and progress for assistive tech", () => {
    expect(stageSummary(deriveStages(["CRUSH"]))).toBe("Ferment — 1 of 6 stages recorded.");
  });

  it("renders the summary as real text, never colour-only", () => {
    expect(INDICATOR).toContain('className="sr-only"');
    expect(INDICATOR).toContain("stageSummary");
  });

  it("distinguishes hollow from recorded by OUTLINE, not a pale fill", () => {
    // A pale fill on warm paper is nearly invisible and reads as "recorded, faintly".
    expect(INDICATOR).toContain("inset 0 0 0 1px var(--paper-400)");
  });
});
