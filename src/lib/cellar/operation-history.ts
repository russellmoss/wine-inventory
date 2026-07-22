import type { OperationType } from "@/lib/ledger/vocabulary";
import { opChipLabel } from "@/lib/vessel/timeline-view";
import type { TimelineItem, OpItem } from "@/lib/lot/timeline";

// Pure, prisma-free logic for the assistant's OPERATION-history read (the ledger counterpart to
// src/lib/chemistry/measurement-history.ts). Filed by the winemaker: the assistant could WRITE an
// operation and read current contents, but had no way to read the ledger BACK — "what additions did
// we make to tank T2" dead-ended in "open the vessel page". The lot page and vessel History already
// render this; this module is the seam that lets the assistant answer from the same data.
//
// Two ledger traps this module exists to keep honest (both learned by the page loaders):
//  • Volume-NEUTRAL ops (ADDITION / FINING / CAP_MGMT) carry NO lot_operation_line rows — they hang
//    off lot_treatment. Any query keyed on lines alone silently drops every dose and punchdown.
//    Callers must UNION the two; this module never assumes legs exist.
//  • LotOperation.id is the monotonic fold order (D14). observedAt is user-supplied and backdatable,
//    so it is display/recency ONLY — never the sort that establishes "what happened after what".

/**
 * Free-text op words → the ledger types they scope to. DELIBERATELY BROADER than
 * `opTypeFilter` in src/lib/assistant/scope.ts: that one guards UNDO, where a loose match is a
 * safety bug ("undo the last addition" must never resolve to a crush), so it stays narrow and
 * single-word. This one only narrows a READ, so it can afford plurals and cellar vernacular.
 */
const OPERATION_FILTER_ALIASES: Record<string, OperationType[]> = {
  // Doses and treatments
  addition: ["ADDITION"], additions: ["ADDITION"], add: ["ADDITION"], adds: ["ADDITION"],
  dose: ["ADDITION"], doses: ["ADDITION"], dosing: ["ADDITION"], added: ["ADDITION"],
  nutrient: ["ADDITION"], nutrients: ["ADDITION"], so2: ["ADDITION"], sulfur: ["ADDITION"],
  sulphur: ["ADDITION"], acid: ["ADDITION"], enzyme: ["ADDITION"], yeast: ["ADDITION"],
  treatment: ["ADDITION", "FINING"], treatments: ["ADDITION", "FINING"],
  fining: ["FINING"], finings: ["FINING"], fine: ["FINING"], fined: ["FINING"],
  // Cap management
  capmgmt: ["CAP_MGMT"], cap: ["CAP_MGMT"], capmanagement: ["CAP_MGMT"],
  punchdown: ["CAP_MGMT"], punchdowns: ["CAP_MGMT"], punch: ["CAP_MGMT"],
  pumpover: ["CAP_MGMT"], pumpovers: ["CAP_MGMT"], batonnage: ["CAP_MGMT"],
  delestage: ["CAP_MGMT"], punchedown: ["CAP_MGMT"],
  // Movements
  rack: ["RACK"], racks: ["RACK"], racking: ["RACK"], rackings: ["RACK"], racked: ["RACK"],
  transfer: ["RACK"], transfers: ["RACK"], move: ["RACK"], moves: ["RACK"],
  topping: ["TOPPING"], toppings: ["TOPPING"], top: ["TOPPING"], topped: ["TOPPING"],
  topup: ["TOPPING"], topoff: ["TOPPING"],
  filtration: ["FILTRATION"], filtrations: ["FILTRATION"], filter: ["FILTRATION"],
  filtered: ["FILTRATION"], filtering: ["FILTRATION"],
  blend: ["BLEND"], blends: ["BLEND"], blending: ["BLEND"], blended: ["BLEND"],
  // Fruit intake / processing
  crush: ["CRUSH"], crushes: ["CRUSH"], crushed: ["CRUSH"], crushing: ["CRUSH"],
  destem: ["CRUSH"], destemming: ["CRUSH"],
  press: ["PRESS"], presses: ["PRESS"], pressed: ["PRESS"], pressing: ["PRESS"],
  saignee: ["SAIGNEE"], bleed: ["SAIGNEE"],
  // Packaging / sparkling
  bottle: ["BOTTLE"], bottles: ["BOTTLE"], bottling: ["BOTTLE"], bottled: ["BOTTLE"],
  tirage: ["TIRAGE"], riddling: ["RIDDLING"], disgorgement: ["DISGORGEMENT"],
  disgorge: ["DISGORGEMENT"], dosage: ["DOSAGE"],
  // Losses and bookkeeping
  loss: ["LOSS"], losses: ["LOSS"], dump: ["LOSS"], dumped: ["LOSS"],
  adjust: ["ADJUST"], adjustment: ["ADJUST"], adjustments: ["ADJUST"],
  correction: ["CORRECTION"], corrections: ["CORRECTION"], undo: ["CORRECTION"],
  fill: ["SEED"], fills: ["SEED"], seed: ["SEED"],
};

/** Normalize a user-supplied op word for alias lookup: lowercase, strip everything non-alphanumeric. */
function normOpWord(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The canonical ledger type names, for accepting `opTypes: ["CAP_MGMT"]` verbatim from the model. */
const CANONICAL_TYPES = new Set<string>([
  "SEED", "RACK", "LOSS", "ADJUST", "DEPLETE", "BOTTLE", "CORRECTION",
  "ADDITION", "TOPPING", "FINING", "FILTRATION", "CAP_MGMT", "BLEND",
  "CRUSH", "PRESS", "SAIGNEE",
  "TIRAGE", "RIDDLING", "DISGORGEMENT", "DOSAGE", "FINISH",
  "REMOVE_TAXPAID", "TRANSFER_IN_BOND", "RETURN_TO_BOND",
]);

export type OperationFilterResult = {
  /** The ledger types to keep, or null for "no type filter — every operation". */
  types: OperationType[] | null;
  /** Words that matched neither an alias nor a canonical type name; the caller reports these. */
  unknown: string[];
};

/**
 * Resolve free-text operation words ("additions", "punchdowns", "CAP_MGMT") to ledger types.
 * An empty/absent list means no filter. Unknown words are returned rather than silently ignored —
 * dropping one would answer a NARROWER question than was asked while looking complete.
 */
export function resolveOperationFilter(words: string[]): OperationFilterResult {
  if (words.length === 0) return { types: null, unknown: [] };
  const types: OperationType[] = [];
  const unknown: string[] = [];
  for (const word of words) {
    const upper = word.trim().toUpperCase().replace(/[\s-]+/g, "_");
    const matched = CANONICAL_TYPES.has(upper)
      ? [upper as OperationType]
      : OPERATION_FILTER_ALIASES[normOpWord(word)];
    if (!matched) {
      unknown.push(word);
      continue;
    }
    for (const t of matched) if (!types.includes(t)) types.push(t);
  }
  return { types: types.length ? types : null, unknown };
}

/** Human label for a ledger op type, reusing the same vocabulary the History chips show. */
export function operationLabel(type: string, capKind: string | null = null): string {
  return opChipLabel(type, capKind);
}

/** Whole days elapsed between an instant and now, floored. Negative (future-dated) clamps to 0. */
export function daysAgo(atMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - atMs) / 86_400_000));
}

const ms = (d: string | Date): number => (d instanceof Date ? d.getTime() : new Date(d).getTime());

export type OperationFilterOpts = {
  /** Ledger types to keep; null/undefined keeps every op. */
  types?: OperationType[] | null;
  /** Drop operations observed before this instant (epoch ms). */
  sinceMs?: number;
  /** Include ops a later CORRECTION reversed. Default false — a reversed dose was NOT applied. */
  includeCorrected?: boolean;
};

/**
 * Narrow a rendered timeline to the OPERATION rows the question asked about.
 *
 * Non-op rows (analyses, tasting notes, samples, maintenance, work orders) are dropped: this tool
 * answers "what was DONE to the wine", and chemistry has its own reader (query_measurements).
 *
 * Corrected ops are EXCLUDED by default. That is the honest default for "what additions did we
 * make" — an addition that was reversed was never made — but it is a filter, not a deletion: the
 * ledger is immutable (D6) and `includeCorrected` brings them back with their `corrected` flag
 * intact so a reversal can still be discussed.
 */
export function filterOperationItems(items: TimelineItem[], opts: OperationFilterOpts = {}): OpItem[] {
  const wanted = opts.types && opts.types.length ? new Set<string>(opts.types) : null;
  const out: OpItem[] = [];
  for (const item of items) {
    if (item.kind !== "OP") continue;
    if (wanted && !wanted.has(item.type)) continue;
    if (!opts.includeCorrected && (item.corrected || item.voided)) continue;
    if (opts.sinceMs != null && ms(item.observedAt) < opts.sinceMs) continue;
    out.push(item);
  }
  return out;
}

/**
 * Collapse the treatment rows of ONE operation on ONE vessel to the distinct physical actions.
 *
 * A pre-LEDGER-12 vessel could hold several co-resident lots, and one physical action on it wrote
 * one `lot_treatment` row PER LOT — the same fan-out `dedupeByPhysicalReading` collapses for
 * analysis panels. Those rows still exist. Reporting them raw makes one pump-over read as two, and
 * a KMBS dose fanned across three lots read as three doses of the same amount: a question about
 * what went into a tank would come back multiplied by the number of lots that happened to be in it.
 *
 * Rows are the same physical action only when EVERY reported field matches — a genuine second dose
 * differs in material, rate, or total, so it survives. Vessel-scoped callers must pass one vessel's
 * rows; a lot-scoped caller already has one row per action and this is a no-op.
 */
export function dedupePhysicalTreatments<
  T extends {
    kind: string;
    materialName?: string | null;
    rateValue?: number | null;
    rateBasis?: string | null;
    computedTotal?: number | null;
    computedUnit?: string | null;
    durationMin?: number | null;
    medium?: string | null;
    micron?: number | null;
  },
>(treatments: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of treatments) {
    const key = JSON.stringify([
      t.kind,
      t.materialName ?? null,
      t.rateValue ?? null,
      t.rateBasis ?? null,
      t.computedTotal ?? null,
      t.computedUnit ?? null,
      t.durationMin ?? null,
      t.medium ?? null,
      t.micron ?? null,
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** One "how many of each" tally, newest-first order preserved by count desc then label. */
export type TypeTally = { type: string; label: string; count: number };

/**
 * Count the returned operations by ledger type. This is what lets the assistant answer "we made
 * four additions" without re-counting a truncated list — the tally is computed over what was
 * matched, and the caller reports `truncated` separately when it returns fewer rows than it found.
 */
export function tallyByType(ops: OpItem[]): TypeTally[] {
  const counts = new Map<string, number>();
  for (const op of ops) counts.set(op.type, (counts.get(op.type) ?? 0) + 1);
  return [...counts.entries()]
    .map(([type, count]) => ({ type, label: operationLabel(type), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// ───────────────────────────── Cross-vessel sweep ─────────────────────────────
// "Which tanks haven't been punched down in three days" / "when did each fermenter last get an
// addition". The measurement counterpart ranks by VALUE; this ranks by RECENCY.

export type SweepInput = {
  vesselLabel: string;
  lotCode: string | null;
  /** The most recent matching op in this vessel's current fill, or null if there is none. */
  last: { opId: number; type: string; summary: string; observedAtMs: number } | null;
};

export type SweepRow = {
  vessel: string;
  lot: string | null;
  operationId: number;
  type: string;
  label: string;
  summary: string;
  observedAt: string;
  daysAgo: number;
};

export type SweepResult = {
  /** Vessels that HAVE a matching op, stalest first — the answer to "which is overdue". */
  ranked: SweepRow[];
  /** Vessels holding wine with NO matching op in the current fill. */
  neverInThisFill: string[];
  /** Ranked rows at or beyond `staleAfterDays`, when the caller supplied a threshold. */
  overdue: SweepRow[];
};

/**
 * Rank occupied vessels by how long it has been since their last matching operation — STALEST
 * FIRST, because every question this serves ("which tanks are overdue", "what needs a punchdown")
 * wants the neglected vessel at the top.
 *
 * `neverInThisFill` is returned SEPARATELY and must never be folded into the ranking. A tank that
 * has never been punched down in this fill is the most overdue vessel there is, but it has no
 * "days since" to sort on — silently dropping it would let "T4 is the most overdue" be stated
 * while a completely untouched T7 sat outside the answer.
 */
export function rankByStaleness(rows: SweepInput[], nowMs: number, staleAfterDays?: number): SweepResult {
  const ranked: SweepRow[] = [];
  const neverInThisFill: string[] = [];
  for (const r of rows) {
    if (!r.last) {
      neverInThisFill.push(r.vesselLabel);
      continue;
    }
    ranked.push({
      vessel: r.vesselLabel,
      lot: r.lotCode,
      operationId: r.last.opId,
      type: r.last.type,
      label: operationLabel(r.last.type),
      summary: r.last.summary,
      observedAt: new Date(r.last.observedAtMs).toISOString(),
      daysAgo: daysAgo(r.last.observedAtMs, nowMs),
    });
  }
  // Oldest observedAt first = most overdue first. Tie-break on the fold order (op id) so the
  // ordering is deterministic when two ops share a backdated timestamp.
  ranked.sort((a, b) => ms(a.observedAt) - ms(b.observedAt) || a.operationId - b.operationId);
  neverInThisFill.sort((a, b) => a.localeCompare(b));
  const overdue = staleAfterDays != null ? ranked.filter((r) => r.daysAgo >= staleAfterDays) : [];
  return { ranked, neverInThisFill, overdue };
}
