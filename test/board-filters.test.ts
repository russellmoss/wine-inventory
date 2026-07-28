import { describe, it, expect } from "vitest";
import {
  parseBoardFilters,
  toQueryString,
  applyBoardFilters,
  filterChips,
  withoutChip,
  toggleState,
  hasAnyFilter,
  resultSummary,
  EMPTY_FILTERS,
  type FilterableTile,
} from "@/lib/vessels/board-filters";

const TILES: FilterableTile[] = [
  { code: "T-01", lotCodes: ["25-PN-04"], wineName: "Estate Pinot", state: "fermenting" },
  { code: "T-02", lotCodes: ["25-SY-01"], wineName: "Syrah", state: "aging" },
  { code: "T-03", lotCodes: [], wineName: null, state: "empty" },
  { code: "T-10", lotCodes: ["25-CH-02"], wineName: "Chardonnay", state: "attention" },
];

describe("parseBoardFilters", () => {
  it("reads state and q", () => {
    expect(parseBoardFilters({ state: "fermenting", q: "syrah" })).toEqual({ state: "fermenting", q: "syrah" });
  });

  it("treats missing params as no filter", () => {
    expect(parseBoardFilters({})).toEqual(EMPTY_FILTERS);
  });

  it("drops an unknown state rather than throwing", () => {
    // A stale bookmark should show the whole board, not an error page.
    expect(parseBoardFilters({ state: "bottled" })).toEqual(EMPTY_FILTERS);
  });

  it("ignores params it does not own", () => {
    expect(parseBoardFilters({ state: "empty", utm_source: "email" })).toEqual({ state: "empty", q: null });
  });

  it("trims, and treats whitespace-only as absent", () => {
    expect(parseBoardFilters({ q: "  pinot  " }).q).toBe("pinot");
    expect(parseBoardFilters({ q: "   " }).q).toBeNull();
  });
});

describe("toQueryString", () => {
  it("is empty when nothing is narrowed", () => {
    expect(toQueryString(EMPTY_FILTERS)).toBe("");
  });

  it("round-trips through parse", () => {
    const f = { state: "attention" as const, q: "25-CH" };
    const qs = toQueryString(f);
    const params = Object.fromEntries(new URLSearchParams(qs.slice(1)).entries());
    expect(parseBoardFilters(params)).toEqual(f);
  });

  it("encodes text that would otherwise break the URL", () => {
    const f = { state: null, q: "a&b=c" };
    const params = Object.fromEntries(new URLSearchParams(toQueryString(f).slice(1)).entries());
    expect(parseBoardFilters(params).q).toBe("a&b=c");
  });
});

describe("applyBoardFilters", () => {
  it("returns everything when nothing is narrowed", () => {
    expect(applyBoardFilters(TILES, EMPTY_FILTERS)).toHaveLength(4);
  });

  it("filters by state", () => {
    expect(applyBoardFilters(TILES, { state: "empty", q: null }).map((t) => t.code)).toEqual(["T-03"]);
  });

  it("matches a lot code — the 'where is the Syrah' case", () => {
    expect(applyBoardFilters(TILES, { state: null, q: "25-SY" }).map((t) => t.code)).toEqual(["T-02"]);
  });

  it("matches a tank code", () => {
    expect(applyBoardFilters(TILES, { state: null, q: "T-10" }).map((t) => t.code)).toEqual(["T-10"]);
  });

  it("matches a wine name, case-insensitively", () => {
    expect(applyBoardFilters(TILES, { state: null, q: "PINOT" }).map((t) => t.code)).toEqual(["T-01"]);
  });

  it("combines state and text with AND, not OR", () => {
    expect(applyBoardFilters(TILES, { state: "aging", q: "syrah" })).toHaveLength(1);
    expect(applyBoardFilters(TILES, { state: "fermenting", q: "syrah" })).toHaveLength(0);
  });

  it("does not crash on a tile with no lot and no wine name", () => {
    expect(applyBoardFilters(TILES, { state: null, q: "zzz" })).toEqual([]);
  });
});

describe("chips", () => {
  it("produces one removable chip per active narrowing", () => {
    const chips = filterChips({ state: "attention", q: "pinot" });
    expect(chips.map((c) => c.key)).toEqual(["state", "q"]);
    expect(chips[0].label).toBe("Needs attention");
    expect(chips[1].label).toBe('"pinot"');
  });

  it("gives every remove control a real accessible name, never a bare glyph", () => {
    for (const c of filterChips({ state: "empty", q: "t-0" })) {
      expect(c.removeLabel.length).toBeGreaterThan(6);
      expect(c.removeLabel).toMatch(/remove/i);
    }
  });

  it("removing a chip clears only that narrowing", () => {
    const f = { state: "aging" as const, q: "syrah" };
    expect(withoutChip(f, "state")).toEqual({ state: null, q: "syrah" });
    expect(withoutChip(f, "q")).toEqual({ state: "aging", q: null });
  });

  it("no chips when nothing is narrowed", () => {
    expect(filterChips(EMPTY_FILTERS)).toEqual([]);
    expect(hasAnyFilter(EMPTY_FILTERS)).toBe(false);
  });
});

describe("toggleState", () => {
  it("selects, then deselects on a second press", () => {
    const once = toggleState(EMPTY_FILTERS, "fermenting");
    expect(once.state).toBe("fermenting");
    expect(toggleState(once, "fermenting").state).toBeNull();
  });

  it("switching states replaces rather than stacks", () => {
    const f = toggleState(toggleState(EMPTY_FILTERS, "fermenting"), "empty");
    expect(f.state).toBe("empty");
  });

  it("preserves the text narrowing", () => {
    expect(toggleState({ state: null, q: "pinot" }, "aging")).toEqual({ state: "aging", q: "pinot" });
  });
});

describe("resultSummary", () => {
  it("states the plain total when nothing is narrowed", () => {
    expect(resultSummary(40, 40, EMPTY_FILTERS)).toBe("40 tanks");
    expect(resultSummary(1, 1, EMPTY_FILTERS)).toBe("1 tank");
  });

  it("states both numbers when narrowed", () => {
    expect(resultSummary(4, 40, { state: "fermenting", q: null })).toBe("4 of 40 tanks");
  });

  it("names the narrowing when nothing matches", () => {
    expect(resultSummary(0, 40, { state: "attention", q: "syrah" })).toBe('No tanks match needs attention · "syrah".');
  });
});
