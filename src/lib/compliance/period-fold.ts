// Unit 6 (pure core) — the period-boundary fold ARITHMETIC. Given a period's begin balances
// (carry-forward, in gallons), the within-period flow contributions (mapped to §A/§B lines, in
// exact liters), and the physical on-hand at period end (exact liters), produce a fully-footed
// §A/§B grid in US gallons.
//
// This is the GATE-critical math (Execution Sequencing: math-first). It is PURE — no DB, no
// @prisma/client — so it is validated against synthetic fixtures AND an independent worked example
// before any migration. The DB orchestration (query the ledger, resolve ABV/forms, build the
// physical on-hand, call mapLineToForm to produce contributions) lives in generate.ts (Unit 8) and
// feeds this engine.
//
// Rounding invariant (council S1): line totals are summed in EXACT liters, converted to gallons and
// rounded to 2 dp ONCE per cell; then End = Begin + Additions − Removals is derived in the rounded
// domain and reconciled against the physically-converted end, with the drift posted to the
// inventory gain/loss line (A9/A30 bulk, B5/B19 bottled) so EVERY column foots exactly.

import { litersToGallons, round2Gal } from "./gallons";
import type { FormSection, SparklingSub, WineTaxClass } from "./types";

// ── Line taxonomy per section (which lines add, which remove, which reconcile) ──
const SECTION_A = {
  begin: 1,
  additions: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // 9 = inventory gain (reconcile); 10/11 blank
  removals: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], // 30 = inventory loss
  end: 31,
  gainLine: 9,
  lossLine: 30,
} as const;

const SECTION_B = {
  begin: 1,
  additions: [2, 3, 4, 5, 6], // 5 = inventory gain (reconcile, rare for bottled); 6 blank
  removals: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], // 19 = inventory shortage (reconcile)
  end: 20,
  gainLine: 5,
  lossLine: 19,
} as const;

const sectionDef = (s: FormSection) => (s === "A" ? SECTION_A : SECTION_B);

/** A discrepancy above this many gallons in a column is a likely REAL inventory difference /
 * un-posted class movement (needs Part X, ftn 4), not mere rounding dust. */
export const MATERIAL_DISCREPANCY_GAL = 0.5;

/** On-hand at a period boundary, per (section, column, sub). */
export type OnHand = { section: FormSection; column: WineTaxClass; sub: SparklingSub; liters: number };
/** Begin balances carried forward, per cell, already in rounded gallons (S3: prior FILED end). */
export type BeginCell = { section: FormSection; column: WineTaxClass; sub: SparklingSub; gallons: number };

/** One within-period flow, already mapped to a form line, in signed EXACT liters (a CORRECTION's
 * inverse leg carries negative liters so it nets against the forward op in the same cell). */
export type LineContribution = {
  section: FormSection;
  line: number;
  column: WineTaxClass;
  sub: SparklingSub;
  liters: number;
};

export type FoldPeriodInput = {
  begin: BeginCell[];
  contributions: LineContribution[];
  endLiters: OnHand[];
  /** Part X reasons surfaced by the mapping step (deduped into the result). */
  partX?: string[];
};

/** A single filled cell of the form (gallons at 2 dp). */
export type FormCell = { section: FormSection; line: number; column: WineTaxClass; sub: SparklingSub; gallons: number };

/** Per-column footing check (line-12/32 or line-7/21 balance). */
export type ColumnFooting = {
  section: FormSection;
  column: WineTaxClass;
  sub: SparklingSub;
  addSideTotal: number; // begin + additions (form total line 12 / 7)
  removeSideTotal: number; // removals + end (form total line 32 / 21)
  foots: boolean;
};

export type FoldPeriodResult = {
  /** Every non-structural filled cell (begin/flows/end), keyed for the UI + PDF. */
  cells: FormCell[];
  /** On-hand end per cell (gallons) — the S3 carry-forward source for the next period. */
  onHandEndGallons: { section: FormSection; column: WineTaxClass; sub: SparklingSub; gallons: number }[];
  footings: ColumnFooting[];
  /** True iff every column foots (drives the "Balances ✓" banner). */
  balanced: boolean;
  /** A13 (bulk bottled-out) total == B2 (bottled-in) total (ftn 3). */
  a13EqualsB2: boolean;
  partX: string[];
};

const cellKey = (column: WineTaxClass, sub: SparklingSub) => `${column}:${sub ?? "-"}`;

/** Fold one period into the §A/§B gallons grid. Pure. */
export function foldPeriodCells(input: FoldPeriodInput): FoldPeriodResult {
  const partX = new Set(input.partX ?? []);

  // 1. Enumerate every (section, column, sub) cell that appears anywhere.
  type CellId = { section: FormSection; column: WineTaxClass; sub: SparklingSub };
  const cellIds = new Map<string, CellId>();
  const idKey = (s: FormSection, c: WineTaxClass, sub: SparklingSub) => `${s}:${cellKey(c, sub)}`;
  const noteCell = (s: FormSection, c: WineTaxClass, sub: SparklingSub) => {
    const k = idKey(s, c, sub);
    if (!cellIds.has(k)) cellIds.set(k, { section: s, column: c, sub });
  };
  for (const b of input.begin) noteCell(b.section, b.column, b.sub);
  for (const c of input.contributions) noteCell(c.section, c.column, c.sub);
  for (const e of input.endLiters) noteCell(e.section, e.column, e.sub);

  // 2. Sum contributions per (cell, line) in EXACT liters, then convert+round each line ONCE (S1).
  const litersByCellLine = new Map<string, number>(); // `${idKey}#${line}` -> exact liters
  for (const c of input.contributions) {
    const k = `${idKey(c.section, c.column, c.sub)}#${c.line}`;
    litersByCellLine.set(k, (litersByCellLine.get(k) ?? 0) + c.liters);
  }

  const beginByCell = new Map(input.begin.map((b) => [idKey(b.section, b.column, b.sub), b.gallons]));
  const endLitersByCell = new Map(input.endLiters.map((e) => [idKey(e.section, e.column, e.sub), e.liters]));

  const cells: FormCell[] = [];
  const footings: ColumnFooting[] = [];
  const onHandEndGallons: FoldPeriodResult["onHandEndGallons"] = [];
  let balanced = true;

  for (const { section, column, sub } of cellIds.values()) {
    const def = sectionDef(section);
    const idk = idKey(section, column, sub);
    const beginG = beginByCell.get(idk) ?? 0;

    // Per-line gallons (rounded once per line).
    const lineGal = new Map<number, number>();
    for (const [k, liters] of litersByCellLine) {
      if (!k.startsWith(idk + "#")) continue;
      const line = Number(k.slice((idk + "#").length));
      lineGal.set(line, litersToGallons(liters));
    }

    const sumLines = (lines: readonly number[], exclude?: number) =>
      round2Gal(lines.reduce((a, l) => (l === exclude ? a : a + (lineGal.get(l) ?? 0)), 0));

    // 3. Preliminary end (rounded domain), EXCLUDING the reconcile lines.
    const addPrelim = sumLines(def.additions, def.gainLine);
    const removePrelim = sumLines(def.removals, def.lossLine);
    const prelimEndG = round2Gal(beginG + addPrelim - removePrelim);

    // 4. Physical end (converted + rounded once).
    const physicalEndG = litersToGallons(endLitersByCell.get(idk) ?? 0);

    // 5. Reconcile the drift to the inventory gain/loss line so the column foots exactly (S1).
    const diff = round2Gal(physicalEndG - prelimEndG);
    if (diff > 0) lineGal.set(def.gainLine, round2Gal((lineGal.get(def.gainLine) ?? 0) + diff));
    else if (diff < 0) lineGal.set(def.lossLine, round2Gal((lineGal.get(def.lossLine) ?? 0) + -diff));

    if (Math.abs(diff) > MATERIAL_DISCREPANCY_GAL) {
      const kind = diff > 0 ? "gain" : section === "A" ? "loss" : "shortage";
      partX.add(
        `Inventory ${kind} of ${Math.abs(diff).toFixed(2)} gal in section ${section} class ${column}${sub ? " " + sub : ""} — verify and explain (physical vs book).`,
      );
    }

    // 6. Final totals including the reconcile line; end = physical (foots by construction).
    const addFinal = sumLines(def.additions);
    const removeFinal = sumLines(def.removals);
    const endG = round2Gal(beginG + addFinal - removeFinal);
    const foots = Math.abs(endG - physicalEndG) < 0.005;
    if (!foots) balanced = false;

    // Emit filled cells: begin (line 1), every flow line with a value, end line.
    if (beginG !== 0) cells.push({ section, line: def.begin, column, sub, gallons: beginG });
    for (const [line, gal] of lineGal) {
      if (gal !== 0) cells.push({ section, line, column, sub, gallons: gal });
    }
    if (physicalEndG !== 0) cells.push({ section, line: def.end, column, sub, gallons: physicalEndG });

    const addSideTotal = round2Gal(beginG + addFinal);
    const removeSideTotal = round2Gal(removeFinal + physicalEndG);
    footings.push({
      section,
      column,
      sub,
      addSideTotal,
      removeSideTotal,
      foots: Math.abs(addSideTotal - removeSideTotal) < 0.005,
    });
    if (Math.abs(addSideTotal - removeSideTotal) >= 0.005) balanced = false;

    onHandEndGallons.push({ section, column, sub, gallons: physicalEndG });
  }

  // ftn 3: §A line 13 total == §B line 2 total.
  const a13 = round2Gal(cells.filter((c) => c.section === "A" && c.line === 13).reduce((a, c) => a + c.gallons, 0));
  const b2 = round2Gal(cells.filter((c) => c.section === "B" && c.line === 2).reduce((a, c) => a + c.gallons, 0));
  const a13EqualsB2 = Math.abs(a13 - b2) < 0.005;

  return {
    cells,
    onHandEndGallons,
    footings,
    balanced,
    a13EqualsB2,
    partX: [...partX],
  };
}
