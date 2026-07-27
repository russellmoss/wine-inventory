import { describe, it, expect } from "vitest";
import {
  assessProductTable,
  isFlatRowLine,
  isProductCell,
  isFactCell,
  MIN_TABLE_ROWS,
  STRONG_FLAT_RUN,
} from "@/lib/knowledge/boundary/product-table-core";

/**
 * SKB Unit 1 — the tabular/prose boundary detector (invariant KB-1).
 *
 * The two cases that matter most are the ones in the middle: the MSU tier-B paragraph that names FRAC
 * groups and MUST stay in the corpus, and the mangled/PDF-flattened table that must NOT be waved
 * through as prose just because the markup is gone. A detector that only gets the obvious ends right
 * is a detector that either guts the eastern corpus or leaks a rate table.
 */

// ── FIXTURES ─────────────────────────────────────────────────────────────────────────────────────
// Excerpted from the shapes recorded in the SKB plan §6. Column gaps are tabs, which is what a
// table-aware pre-chunk representation preserves.

/** ENTO-635-C Table 3.1 — Disease and Insect Control. pp. 2-9 of a 23-page PDF, ~22 of them tables. */
const ENTO_TABLE_3_1 = [
  "Table 3.1. Disease and Insect Control",
  "Pest\tPesticide Name and Formulation\tRate/Acre\tSpray Timing",
  "Black rot\tAbound 2.08SC\t11.0 to 15.4 fl oz/A\t14 day intervals",
  "Black rot\tRally 40WSP\t4.0 to 5.0 oz/A\t14 day intervals",
  "Powdery mildew\tQuintec 2.08SC\t3.0 to 5.0 fl oz/A\t14 day intervals",
  "Powdery mildew\tVivando 2.5SC\t10.3 to 15.4 fl oz/A\t14 day intervals",
  "Downy mildew\tRidomil Gold 2.5SC\t12.0 fl oz/A\t21 day intervals",
  "Downy mildew\tRevus Top 4.16SC\t7.0 fl oz/A\t14 day intervals",
  "Phomopsis\tMancozeb 75DF\t3.0 to 4.0 lb/A\t10 day intervals",
  "Phomopsis\tCaptan 80WDG\t2.5 lb/A\t10 day intervals",
  "Botrytis\tVangard 75WG\t10.0 oz/A\t7 day intervals",
  "Botrytis\tElevate 50WDG\t1.0 lb/A\t7 day intervals",
  "Grape berry moth\tIntrepid 2F\t10.0 to 16.0 fl oz/A\t10 day intervals",
  "Grape berry moth\tAltacor 35WDG\t3.0 to 4.5 oz/A\t10 day intervals",
  "Japanese beetle\tSevin 4F\t1.5 to 2.0 qt/A\t7 day intervals",
  "Japanese beetle\tAssail 30SG\t2.5 to 5.3 oz/A\t7 day intervals",
  "Spotted lanternfly\tBrigade 2EC\t6.4 fl oz/A\t14 day intervals",
].join("\n");

/** ENTO-635-C Table 3.4 — Trade name / Manufacturer / REI / Days to Harvest. pp. 14-16. */
const ENTO_TABLE_3_4 = [
  "Table 3.4. Restricted Entry Intervals and Days to Harvest",
  "Trade Name\tManufacturer\tRestricted Entry Interval\tDays to Harvest",
  "Abound\tSyngenta\t4 hours\t14 days",
  "Rally\tCorteva\t24 hours\t14 days",
  "Quintec\tGowan\t12 hours\t14 days",
  "Vivando\tBASF\t12 hours\t14 days",
  "Ridomil Gold\tSyngenta\t48 hours\t21 days",
  "Mancozeb\tUPL\t24 hours\t66 days",
  "Captan\tArysta\t96 hours\t0 days",
  "Vangard\tSyngenta\t12 hours\t7 days",
].join("\n");

/**
 * The SAME Table 3.1, after `extract/pdf.ts`. Column gaps collapse to single spaces and the heading
 * structure is gone — which is precisely why the detector cannot be allowed to read extracted text
 * (council C2). This fixture is the regression test for that defect: it is the one case an
 * extracted-text detector would have called prose.
 */
const ENTO_TABLE_3_1_PDF_EXTRACTED = ENTO_TABLE_3_1.replace(/\t/g, " ");

/** PSU `/fundamental-considerations-for-managing-fungal-diseases-of-grapevines` — the ~40-row matrix. */
const PSU_TRADE_NAME_MATRIX = `
<h2>Fungicide efficacy for grape diseases</h2>
<p>The table below summarizes relative efficacy. Always follow the product label.</p>
<table>
<tr><th>Active Ingredient (Trade Name)</th><th>Black rot</th><th>Powdery mildew</th><th>Downy mildew</th><th>Phomopsis</th></tr>
<tr><td>azoxystrobin (Abound)</td><td>E</td><td>G</td><td>E</td><td>G</td></tr>
<tr><td>myclobutanil (Rally)</td><td>E</td><td>E</td><td>N</td><td>P</td></tr>
<tr><td>quinoxyfen (Quintec)</td><td>N</td><td>E</td><td>N</td><td>N</td></tr>
<tr><td>mefenoxam (Ridomil Gold)</td><td>N</td><td>N</td><td>E</td><td>N</td></tr>
<tr><td>mancozeb (Dithane)</td><td>G</td><td>P</td><td>G</td><td>G</td></tr>
<tr><td>captan (Captan)</td><td>F</td><td>P</td><td>G</td><td>G</td></tr>
</table>
`;

/**
 * The tier-B case that MUST NOT trip. MSU's July 2026 scouting report: FRAC groups as context, an
 * explicit delegation to the label, zero rates. Pure advisory prose, and the exact voice the eastern
 * expansion exists to acquire. If this fails, the phase has no value left.
 */
const MSU_TIER_B_PROSE = `
<p>Downy mildew pressure has increased sharply across southwest Michigan following last week's rainfall.
Products in FRAC groups 3 (DMIs) and 11 (QoIs) remain key options for powdery mildew and black rot,
while multi-site protectants such as captan (M4) or mancozeb (M3) provide additional coverage and are
important resistance-management partners. Growers should alternate modes of action across the season
rather than making consecutive applications from a single group.</p>
<p>Always follow the product label for grape age restrictions, rates, adjuvants, maximum seasonal use,
preharvest intervals, and restricted-entry intervals. Label directions supersede any recommendation
made here, and registrations change between seasons.</p>
`;

/** PSU `/grape-disease-black-rot` — tier A. Zero hits on rate/REI/PHI/FRAC across ~15k chars. */
const PSU_BLACK_ROT_PROSE = `
<h1>Grape Disease - Black Rot</h1>
<p>Black rot, caused by the fungus Guignardia bidwellii, is one of the most serious diseases of grapes
in the eastern United States. The fungus overwinters in mummified berries on the vineyard floor and in
old cluster stems retained in the canopy.</p>
<p>Primary infection occurs in spring when overwintered mummies release ascospores during rain events.
Leaf lesions appear as small reddish-brown circular spots that enlarge and develop a dark border with
tiny black pycnidia scattered across the tan center.</p>
<p>Fruit becomes susceptible shortly after bloom and remains susceptible for approximately four to six
weeks. Infected berries turn brown, shrivel, and harden into black mummies that persist on the cluster.</p>
<p>Cultural control begins with sanitation. Remove and destroy mummified fruit from the trellis during
dormant pruning, and cultivate lightly to bury mummies on the vineyard floor before budbreak.</p>
`;

/** UC IPM prose, an existing live source that must keep passing. */
const UC_IPM_PROSE = `
<h2>Powdery Mildew</h2>
<p>Powdery mildew of grape is caused by Erysiphe necator. Unlike most fungal pathogens of grape, it does
not require free water for infection and can develop under warm, dry conditions with moderate humidity.</p>
<p>Monitor shaded interior leaves beginning at budbreak. Colonies appear as whitish patches on the upper
or lower leaf surface and later produce a dusty gray sporulating growth.</p>
`;

/** A tier-A biology table that MUST pass: growth stage x degree days. Has intervals, names no product. */
const PHENOLOGY_TABLE = `
<h2>Grape phenology and degree-day accumulation</h2>
<table>
<tr><th>Growth stage</th><th>Typical timing</th><th>Base 50F degree days</th></tr>
<tr><td>Bud swell</td><td>7 days</td><td>60</td></tr>
<tr><td>Bud break</td><td>14 days</td><td>110</td></tr>
<tr><td>First leaf</td><td>21 days</td><td>190</td></tr>
<tr><td>Bloom</td><td>55 days</td><td>620</td></tr>
<tr><td>Veraison</td><td>110 days</td><td>1850</td></tr>
</table>
`;

/** Headers declared, no data rows. Nothing has leaked, so nothing is being protected against. */
const HEADERS_NO_ROWS = `
<h2>Spray table (under revision)</h2>
<table>
<tr><th>Trade Name</th><th>Rate/Acre</th><th>Restricted Entry Interval</th><th>Days to Harvest</th></tr>
</table>
<p>This table is being revised for the coming season and will be republished before budbreak.</p>
`;

/**
 * The council C2 case: a table whose markup a parser mangled into a flat text list. An earlier draft
 * of this detector failed OPEN here, which meant the only thing preventing a table ingest was perfect
 * detection.
 */
const MANGLED_TABLE_AS_FLAT_LIST = `
<div class="legacy-spray-block">
Abound 2.08SC 15.4 fl oz/A 4 hours 14 days
Rally 40WSP 5.0 oz/A 24 hours 14 days
Quintec 2.08SC 5.0 fl oz/A 12 hours 14 days
Vivando 2.5SC 15.4 fl oz/A 12 hours 14 days
Ridomil Gold 2.5SC 12.0 fl oz/A 48 hours 21 days
Mancozeb 75DF 4.0 lb/A 24 hours 66 days
</div>
`;

// ── THE PLAN'S TEST MATRIX ───────────────────────────────────────────────────────────────────────

describe("KB-1 detector — tier C is refused", () => {
  it("ENTO-635-C Table 3.1 (Pest / Pesticide / Rate per acre / Timing) is a product table", () => {
    const r = assessProductTable({ kind: "text", text: ENTO_TABLE_3_1 });
    expect(r.verdict).toBe("product-table");
    expect(r.rowCount).toBeGreaterThanOrEqual(STRONG_FLAT_RUN);
  });

  it("ENTO-635-C Table 3.4 (Trade name / REI / Days to harvest) is a product table or uncertain, never prose", () => {
    const r = assessProductTable({ kind: "text", text: ENTO_TABLE_3_4 });
    expect(r.verdict).not.toBe("prose");
  });

  it("the PSU trade-name x disease efficacy matrix is a product table", () => {
    const r = assessProductTable({ kind: "html", html: PSU_TRADE_NAME_MATRIX });
    expect(r.verdict).toBe("product-table");
    expect(r.structured).toBe(true);
    expect(r.rowCount).toBeGreaterThanOrEqual(MIN_TABLE_ROWS);
  });
});

describe("KB-1 detector — tier A and tier B pass", () => {
  it("the MSU tier-B paragraph naming FRAC groups is PROSE (the case the phase's value depends on)", () => {
    const r = assessProductTable({ kind: "html", html: MSU_TIER_B_PROSE });
    expect(r.verdict).toBe("prose");
  });

  it("a PSU grape-disease biology article is prose", () => {
    const r = assessProductTable({ kind: "html", html: PSU_BLACK_ROT_PROSE });
    expect(r.verdict).toBe("prose");
  });

  it("UC IPM prose (a live incumbent) is prose", () => {
    const r = assessProductTable({ kind: "html", html: UC_IPM_PROSE });
    expect(r.verdict).toBe("prose");
  });

  it("a phenology / degree-day table is prose — this is a PRODUCT-table detector, not a table detector", () => {
    const r = assessProductTable({ kind: "html", html: PHENOLOGY_TABLE });
    expect(r.verdict).toBe("prose");
  });

  it("a table with headers but no rows is prose — nothing has leaked", () => {
    const r = assessProductTable({ kind: "html", html: HEADERS_NO_ROWS });
    expect(r.verdict).toBe("prose");
    expect(r.rowCount).toBe(0);
  });
});

describe("KB-1 detector — the two council C2 regressions", () => {
  it("a structurally mangled table surviving as a flat text list is UNCERTAIN, not prose", () => {
    const r = assessProductTable({ kind: "html", html: MANGLED_TABLE_AS_FLAT_LIST });
    expect(r.verdict).toBe("uncertain");
    expect(r.structured).toBe(false);
  });

  it("ENTO-635-C Table 3.1 AFTER the PDF text extractor is never prose (the seam-regression case)", () => {
    const r = assessProductTable({ kind: "text", text: ENTO_TABLE_3_1_PDF_EXTRACTED });
    expect(r.verdict).not.toBe("prose");
  });
});

/**
 * ── REGRESSIONS FROM THE LIVE CHECK (2026-07-27) ──
 *
 * Every fixture above was written by the same person who wrote the detector, so none of them could
 * say whether the mental model of real extension markup was right. Running the detector against the
 * ACTUAL pages the plan §6 classified by hand found two defects that all 24 fixtures missed. Both are
 * pinned here so they cannot come back without the network.
 *
 * Live result before the fix: 6/10 agreed. After: 8/10, with the two remaining "disagreements" being
 * wrong EXPECTATIONS rather than wrong verdicts (a /SprayGuide/ table-of-contents page that genuinely
 * has no rows, and the UC IPM page below).
 */
describe("KB-1 detector — markup density (the defect the live check found)", () => {
  /**
   * PSU serves ~370 KB of HTML for ~16 KB of visible text — about 4 %. The detector sliced the raw
   * markup to 4 KB and stripped tags afterwards, so its window onto a table was ~160 characters of
   * TEXT and the header row fell outside it. Measured cost on real pages: a 7-row efficacy matrix and
   * a 29-row product x efficacy table BOTH read as prose. Fix: strip first, then slice.
   */
  const DENSE_ATTRS = ' class="cms-block cms-table-block layout-full" data-analytics-region="body" role="presentation"';
  const PSU_DENSITY_TABLE = `
<h2>Efficacy of pesticides for grape disease control</h2>
<table${DENSE_ATTRS}>
${"<colgroup><col style=\"width:16.6%\" /></colgroup>".repeat(90)}
<tr${DENSE_ATTRS}><th${DENSE_ATTRS}>Trade Name</th><th${DENSE_ATTRS}>Black rot</th><th${DENSE_ATTRS}>Powdery mildew</th><th${DENSE_ATTRS}>Downy mildew</th></tr>
<tr${DENSE_ATTRS}><td${DENSE_ATTRS}>Abound</td><td>E</td><td>G</td><td>E</td></tr>
<tr${DENSE_ATTRS}><td${DENSE_ATTRS}>Rally</td><td>E</td><td>E</td><td>N</td></tr>
<tr${DENSE_ATTRS}><td${DENSE_ATTRS}>Quintec</td><td>N</td><td>E</td><td>N</td></tr>
<tr${DENSE_ATTRS}><td${DENSE_ATTRS}>Mancozeb</td><td>G</td><td>P</td><td>G</td></tr>
<tr${DENSE_ATTRS}><td${DENSE_ATTRS}>Captan</td><td>F</td><td>P</td><td>G</td></tr>
</table>`;
// Bare trade names on purpose: a formulation code ("Abound 2.08SC") would qualify the table by the
// named-product route and the header window would never be exercised. The real pages that failed
// carried plain names, so the fixture has to as well or it proves nothing.

  it("finds a header row that sits beyond 4 KB of RAW markup", () => {
    // The header row is >4000 chars into the markup but well inside the first 4000 chars of TEXT.
    expect(PSU_DENSITY_TABLE.indexOf("Trade Name")).toBeGreaterThan(4000);
    const r = assessProductTable({ kind: "html", html: PSU_DENSITY_TABLE });
    expect(r.verdict).toBe("product-table");
    expect(r.structured).toBe(true);
  });

  /**
   * A spray table's caption is routinely a heading ABOVE the <table>, not a <th> inside it. Refusing
   * to look there is how VT's 29-row GrapePestEfficacy table survived as prose despite the detector
   * counting all 29 of its rows.
   */
  it("qualifies a table on a document-level caption when the table declares no header of its own", () => {
    const captionAbove = `
<h2>Relative effectiveness of fungicides for grape disease control</h2>
<table>
<tr><td>Abound</td><td>E</td><td>G</td></tr>
<tr><td>Rally</td><td>E</td><td>E</td></tr>
<tr><td>Quintec</td><td>N</td><td>E</td></tr>
<tr><td>Mancozeb</td><td>G</td><td>P</td></tr>
<tr><td>Captan</td><td>F</td><td>P</td></tr>
</table>`;
    expect(assessProductTable({ kind: "html", html: captionAbove }).verdict).toBe("product-table");
  });

  it("but a document with NO header signal anywhere still passes — the phenology table did not regress", () => {
    // This is the guard on the fix above: doc-level qualification must not become "any table counts".
    expect(assessProductTable({ kind: "html", html: PHENOLOGY_TABLE }).verdict).toBe("prose");
  });
});

describe("KB-1 detector — it is data, never an exception", () => {
  // A throw out of the index path is read by the monthly re-crawl's tombstone pass as "the page was
  // removed", so a detector crash on one weird document could mark a whole source `withdrawn`.
  const ADVERSARIAL: [string, string][] = [
    ["empty", ""],
    ["whitespace only", "   \n\n\t  "],
    ["unclosed table", "<table><tr><td>Abound 2.08SC<td>15.4 fl oz/A"],
    ["nested tables", "<table><tr><td><table><tr><td>Abound</td><td>4 hours</td></tr></table></td></tr></table>"],
    ["tag soup", "<<>><table<tr>>><td/></tr</table"],
    ["binary-ish bytes", "  %PDF-1.4 ��"],
    ["very long single line", `Abound ${"x ".repeat(50_000)} 4 hours`],
  ];

  it.each(ADVERSARIAL)("does not throw on %s", (_label, payload) => {
    expect(() => assessProductTable({ kind: "html", html: payload })).not.toThrow();
    expect(() => assessProductTable({ kind: "text", text: payload })).not.toThrow();
  });

  it("always returns one of the three verdicts", () => {
    for (const [, payload] of ADVERSARIAL) {
      expect(["prose", "product-table", "uncertain"]).toContain(
        assessProductTable({ kind: "text", text: payload }).verdict,
      );
    }
  });
});

describe("KB-1 detector — the cell and line primitives", () => {
  it("recognises structured values as fact cells", () => {
    for (const v of ["15.4 fl oz/A", "4 hours", "14 days", "E", "M4", "3, 11", "2.5"]) {
      expect(isFactCell(v), v).toBe(true);
    }
  });

  it("does not call an ordinary label a fact cell", () => {
    for (const v of ["Black rot", "Trade Name", "azoxystrobin (Abound)", "Growth stage"]) {
      expect(isFactCell(v), v).toBe(false);
    }
  });

  it("recognises a product-naming cell", () => {
    for (const v of ["azoxystrobin (Abound)", "Abound 2.08SC", "Rally 40WSP", "Captan"]) {
      expect(isProductCell(v), v).toBe(true);
    }
  });

  it("refuses a whole sentence as a product cell — a product name is not prose", () => {
    expect(
      isProductCell(
        "Products in FRAC groups 3 and 11 remain key options for powdery mildew and black rot this season",
      ),
    ).toBe(false);
  });

  it("an advisory sentence carrying ONE interval is not a row; a collapsed table row is", () => {
    // The discriminator that keeps tier B in the corpus: two DISTINCT fact kinds on a short line.
    expect(isFlatRowLine("Apply at 7 to 10 day intervals through bloom.")).toBe(false);
    expect(isFlatRowLine("Abound 2.08SC 15.4 fl oz/A 4 hours 14 days")).toBe(true);
  });

  it("thresholds ride row count, not document size", () => {
    // The same six rows, padded with 40 KB of unrelated prose. Verdict must not move.
    const padded = MANGLED_TABLE_AS_FLAT_LIST + "\n<p>" + "Downy mildew develops in humid weather. ".repeat(1000) + "</p>";
    expect(assessProductTable({ kind: "html", html: padded }).verdict).toBe("uncertain");
    // And a short document with a full table is still caught.
    expect(assessProductTable({ kind: "html", html: PSU_TRADE_NAME_MATRIX }).verdict).toBe("product-table");
  });
});
