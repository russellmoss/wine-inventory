/**
 * What a vessel is MADE OF, as one readable line.
 *
 * A vessel holds one wine (LEDGER-12). That answers "what is this?" but not "where did my Cabernet
 * go?" — and when a rack absorbs Cab into a Pinot lot, a winemaker who can't see the Cab afterwards
 * reads the absorb as data loss. `vessel_component` already records the answer (variety / vineyard /
 * vintage, attributed through lineage by `composeLeaves`); this turns it into display.
 *
 * Pure — no Prisma, no React — so the percentage, ordering and shortfall rules are unit-tested
 * without a DB, and the same numbers feed the vessel list, the vessel detail, and any export.
 *
 * TWO deliberate rules, both about not lying:
 *
 * 1. Percentages are of the vessel's TOTAL wine, not of the recorded components. If a lot arrived
 *    with no origin on record (a seeded fixture, a pre-migration lot), the gap surfaces as its own
 *    "source unrecorded" share instead of being renormalised away. The design spec calls for the
 *    incomplete-provenance affordance, "never a silent gap".
 * 2. The displayed percentages sum to exactly 100 (largest-remainder), so the line never reads
 *    "82% Pinot Noir · 17% Cabernet" and invites the question of where the last 1% went.
 */

/** One row of `vessel_component` — the joint (variety, vineyard, vintage) tuple, with its volume. */
export type CompositionComponent = {
  varietyName: string;
  vineyardName: string;
  vintage: number | null;
  volumeL: number;
};

export type CompositionSlice = {
  /** Stable React key + test handle. */
  key: string;
  /** What to call it. For the unrecorded remainder this is the honest phrase, not a variety. */
  label: string;
  vineyardName: string | null;
  vintage: number | null;
  volumeL: number;
  /** Whole percent of the vessel's total wine. Slices sum to exactly 100. */
  pct: number;
  /** How to WRITE the percent: "82%", or "<1%" for a real component too small to round up to one.
   *  A co-fermented 0.3% Viognier is a winemaking fact; printing it as "0% Viognier" next to
   *  "100% Syrah" reads as a contradiction, and dropping it reads as data loss. */
  pctLabel: string;
  /** True for the "source unrecorded" slice, so the UI can mark it without parsing the label. */
  unrecorded: boolean;
};

export type VesselComposition = {
  /** Collapsed line: one slice per VARIETY (vineyards + vintages folded together), share desc. */
  byVariety: CompositionSlice[];
  /** Expanded: the full joint tuple, share desc. */
  detail: CompositionSlice[];
  /** Wine in the vessel with no recorded origin. 0 when provenance is complete. */
  unrecordedL: number;
  provenanceComplete: boolean;
  /** "82% Pinot Noir · 18% Cabernet Sauvignon" — the one-line readout. "" when the vessel is empty. */
  summary: string;
};

/** Below this, a volume is noise from Decimal(6,5) fraction rounding, not real wine. */
const EPS_L = 0.05;

/**
 * Whole percents that sum to exactly 100, by largest remainder. Zero-volume input yields no slices;
 * a slice whose exact share rounds to 0 still gets 0 rather than being dropped (it is real wine, and
 * the caller decides whether to show it) — but it never steals a point from a bigger one.
 */
function allocatePercents(volumes: number[], total: number): number[] {
  if (total <= 0) return volumes.map(() => 0);
  const exact = volumes.map((v) => (v / total) * 100);
  const floors = exact.map((e) => Math.floor(e));
  let remaining = 100 - floors.reduce((a, b) => a + b, 0);
  // Hand the leftover points to the largest fractional parts first — ties break toward the bigger
  // slice, so the order the winemaker reads matches the order the points were assigned.
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e), size: e }))
    .sort((a, b) => b.frac - a.frac || b.size - a.size);
  const out = [...floors];
  for (const { i } of order) {
    if (remaining <= 0) break;
    out[i] += 1;
    remaining -= 1;
  }
  return out;
}

function sliceLabel(c: CompositionComponent): string {
  return c.varietyName;
}

/**
 * Summarise a vessel's composition.
 *
 * @param totalVolumeL the vessel's actual fill (the ledger total), NOT the component sum — the
 *        difference between the two is exactly the unrecorded-provenance gap this surfaces.
 */
export function summarizeVesselComposition(
  totalVolumeL: number,
  components: CompositionComponent[],
): VesselComposition {
  const total = Math.max(0, totalVolumeL);
  const real = components.filter((c) => c.volumeL > EPS_L);
  const recordedL = real.reduce((a, c) => a + c.volumeL, 0);
  const unrecordedL = Math.max(0, total - recordedL) > EPS_L ? total - recordedL : 0;
  const provenanceComplete = unrecordedL === 0;

  if (total <= EPS_L) {
    return { byVariety: [], detail: [], unrecordedL: 0, provenanceComplete: true, summary: "" };
  }

  // Detail = the joint tuple, as stored. Variety = the same wine folded to the question a winemaker
  // actually asks first ("how much Cab is in there?"), which spans vineyards and vintages.
  const byVarietyMap = new Map<string, number>();
  for (const c of real) byVarietyMap.set(c.varietyName, (byVarietyMap.get(c.varietyName) ?? 0) + c.volumeL);

  const detailRows = [...real].sort((a, b) => b.volumeL - a.volumeL);
  const varietyRows = [...byVarietyMap.entries()].sort((a, b) => b[1] - a[1]);

  const build = (
    rows: { key: string; label: string; vineyardName: string | null; vintage: number | null; volumeL: number }[],
  ): CompositionSlice[] => {
    const withGap = unrecordedL > 0
      ? [...rows, { key: "unrecorded", label: "Source unrecorded", vineyardName: null, vintage: null, volumeL: unrecordedL }]
      : rows;
    const pcts = allocatePercents(withGap.map((r) => r.volumeL), total);
    return withGap.map((r, i) => ({
      ...r,
      pct: pcts[i],
      pctLabel: pcts[i] === 0 && r.volumeL > EPS_L ? "<1%" : `${pcts[i]}%`,
      unrecorded: r.key === "unrecorded",
    }));
  };

  const byVariety = build(
    varietyRows.map(([name, volumeL]) => ({ key: `v:${name}`, label: name, vineyardName: null, vintage: null, volumeL })),
  );
  const detail = build(
    detailRows.map((c, i) => ({
      key: `d:${i}:${c.varietyName}:${c.vineyardName}:${c.vintage ?? "nv"}`,
      label: sliceLabel(c),
      vineyardName: c.vineyardName,
      vintage: c.vintage,
      volumeL: c.volumeL,
    })),
  );

  // A single-origin vessel reads "100% Pinot Noir", not "Pinot Noir" — the percent is the point.
  const summary = byVariety.map((s) => `${s.pctLabel} ${s.label}`).join(" · ");
  return { byVariety, detail, unrecordedL, provenanceComplete, summary };
}

/** Screen-reader text for one slice — "82 percent Pinot Noir", never a bare number next to a bar. */
export function compositionAriaLabel(slice: CompositionSlice): string {
  return slice.pct === 0 && slice.volumeL > 0
    ? `less than 1 percent ${slice.label}`
    : `${slice.pct} percent ${slice.label}`;
}
