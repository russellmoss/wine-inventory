import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { boardColumns, boardRows, BOARD_BREAKPOINTS, TILE_MIN_WIDTH, TILE_MIN_HEIGHT } from "@/lib/vessels/board-layout";
import { code } from "./helpers/code";

const CSS = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8");
const BOARD = readFileSync(join(__dirname, "../src/app/(app)/bulk/TankBoard.tsx"), "utf8");
const TILE = readFileSync(join(__dirname, "../src/app/(app)/bulk/TankTile.tsx"), "utf8");

describe("boardColumns — doc 04 §7", () => {
  it("matches the specified table exactly", () => {
    expect(boardColumns(390)).toBe(2);
    expect(boardColumns(430)).toBe(2);
    expect(boardColumns(768)).toBe(4);
    expect(boardColumns(1024)).toBe(6);
    expect(boardColumns(1440)).toBe(6);
    expect(boardColumns(2560)).toBe(6);
  });

  it("never drops below two columns, even absurdly narrow", () => {
    expect(boardColumns(0)).toBe(2);
    expect(boardColumns(240)).toBe(2);
  });

  it("switches ON the breakpoint, not one pixel after", () => {
    expect(boardColumns(767)).toBe(2);
    expect(boardColumns(768)).toBe(4);
    expect(boardColumns(1023)).toBe(4);
    expect(boardColumns(1024)).toBe(6);
  });

  it("breakpoints are ascending, so the fold cannot mis-order", () => {
    const mins = BOARD_BREAKPOINTS.map((b) => b.minWidth);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });
});

describe("boardRows", () => {
  it("doc 04 §7: 40 tanks fit in 7 rows at 1440", () => {
    expect(boardRows(40, 1440)).toBe(7);
  });

  it("40 tanks on a phone is 20 rows of two", () => {
    expect(boardRows(40, 390)).toBe(20);
  });

  it("no tanks is no rows, not one empty one", () => {
    expect(boardRows(0, 1440)).toBe(0);
    expect(boardRows(-1, 1440)).toBe(0);
  });

  it("a partial last row still counts", () => {
    expect(boardRows(7, 1024)).toBe(2);
    expect(boardRows(6, 1024)).toBe(1);
  });
});

describe("the CSS and the data table agree", () => {
  // Two sources for one layout is exactly how a spec and its implementation drift.
  it("globals.css declares the board grid", () => {
    expect(CSS).toContain(".bw-tank-board");
  });

  it("every breakpoint in the data has a matching column count in the CSS", () => {
    for (const bp of BOARD_BREAKPOINTS) {
      expect(CSS).toContain(`repeat(${bp.columns}, minmax(0, 1fr))`);
    }
    expect(CSS).toContain("@media (min-width: 768px)");
    expect(CSS).toContain("@media (min-width: 1024px)");
  });

  it("the board uses the class rather than fighting it with an inline grid", () => {
    expect(BOARD).toContain('className="bw-tank-board"');
    expect(code(BOARD)).not.toContain("gridTemplateColumns");
  });
});

describe("tile contract", () => {
  it("doc 04 §7 tile minimum is 132×86", () => {
    expect(TILE_MIN_WIDTH).toBe(132);
    expect(TILE_MIN_HEIGHT).toBe(86);
  });

  it("the tile applies those minimums", () => {
    expect(TILE).toContain("minWidth: TILE_MIN_WIDTH");
    expect(TILE).toContain("minHeight: TILE_MIN_HEIGHT");
  });

  it("AC-S22 — the tile renders the lot code, not just the tank code", () => {
    expect(TILE).toContain("lotCode=");
    expect(TILE).toContain("VesselIdentityBlock");
  });

  it("the whole tile is ONE control with one accessible name", () => {
    expect(TILE).toContain("aria-label={label}");
    // A nested button inside the tile button would be invalid HTML and a keyboard trap.
    expect(code(TILE).match(/<button/g) ?? []).toHaveLength(1);
  });

  it("the accessible name carries state and volume, not just the code", () => {
    expect(TILE).toContain("TANK_STATE_LABEL[tile.state].toLowerCase()");
    expect(TILE).toContain("${filled} of ${capacity}");
  });

  it("does not blanket-hide its subtree — the Phase 3 aria-hidden-focus lesson", () => {
    const buttonBody = TILE.slice(TILE.indexOf("<button"), TILE.indexOf("</button>"));
    expect(code(buttonBody)).not.toContain('aria-hidden="true" style={{ display: "flex", flexDirection: "column"');
  });

  it("SC-10 — loading renders real-size tiles in the real grid, never a spinner", () => {
    expect(TILE).toContain("TankTileSkeleton");
    expect(BOARD).toContain("TankBoardSkeleton");
    expect(code(BOARD)).not.toContain("Spinner");
  });
});

describe("keyboard hints stay Windows-native", () => {
  it("no Mac glyphs in the board or the tile", () => {
    // Belt and braces over test/search-palette.test.ts's whole-src scan.
    expect(/[⌘⌥⌃⇧]/.test(code(BOARD))).toBe(false);
    expect(/[⌘⌥⌃⇧]/.test(code(TILE))).toBe(false);
  });
});
