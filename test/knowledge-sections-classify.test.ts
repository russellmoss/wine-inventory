import { describe, it, expect } from "vitest";
import { classifySection, normalizeHeading } from "@/lib/knowledge/sections/classify-section";

const drops = (h: string) => classifySection(h).keep === false;
const keeps = (h: string) => classifySection(h).keep === true;

describe("normalizeHeading", () => {
  it("strips arabic and Roman section numbers", () => {
    expect(normalizeHeading("3. The Technical Study Tour")).toBe("The Technical Study Tour");
    expect(normalizeHeading("II. Virginia Tech Enology Service Lab.")).toBe(
      "Virginia Tech Enology Service Lab.",
    );
    expect(normalizeHeading("29bii. Rinse Protocol")).toBe("Rinse Protocol");
  });

  it("strips markdown emphasis and normalizes the archive's spelling variants", () => {
    expect(normalizeHeading("_Winery Planning and Design_, Edition 16, Available")).toBe(
      "Winery Planning and Design, Edition 16, Available",
    );
    expect(normalizeHeading("Red Wines – A Review")).toBe("Red Wines - A Review");
    expect(normalizeHeading("New On-Line Publications")).toBe("New Online Publications");
    expect(normalizeHeading("Norton Round Table")).toBe("Norton Roundtable");
  });

  it("leaves a heading with no leading number untouched", () => {
    expect(normalizeHeading("Polysaccharides and instability")).toBe("Polysaccharides and instability");
  });
});

describe("classifySection — DROP: the three non-technical genres", () => {
  it("drops the user's three named sections", () => {
    // These are the exact sections Russell pointed at: 165.html#6, 166.html#3, 166.html#5
    expect(drops("6. In Memory of Dr. Keith Patterson")).toBe(true);
    expect(drops("3. The Technical Study Tour: Alsace, Burgundy and Champagne.")).toBe(true);
    expect(drops("5. Our New Research Enologist.")).toBe(true);
  });

  it("drops event and commerce promotion", () => {
    expect(drops("Wine Filtration Workshop, February 10")).toBe(true);
    expect(drops("Juice and Wine Analysis Short Course")).toBe(true);
    expect(drops("Sixth International Cool Climate Symposium")).toBe(true);
    expect(drops("Winery Establishment Conference, 2009")).toBe(true);
    expect(drops("Annual meeting of the American Society for Enology and Viticulture")).toBe(true);
    expect(drops("ASEV-Eastern Section Meeting")).toBe(true);
    expect(drops("Wine Closure Roundtable Meeting")).toBe(true);
    expect(drops("Argentina and Chile Wine Trip")).toBe(true);
    expect(drops("Calendar of Up-Coming Programs")).toBe(true);
  });

  it("drops personnel and memorial news", () => {
    expect(drops("In Remembrance")).toBe(true);
    expect(drops("Best Student Paper Award")).toBe(true);
    expect(drops("Scholarship Recipient")).toBe(true);
    expect(drops("Viticulture and Enology Interns")).toBe(true);
    expect(drops("Out of Office")).toBe(true);
    expect(drops("Enology Advisory Committee Formed")).toBe(true);
  });

  it("the word boundary after 'intern' is load-bearing", () => {
    // Isolates the guard. "Sixth International Cool Climate Symposium" does NOT prove it, because
    // `symposium` catches that title in the event check first -- the personnel rule never runs.
    // A technical title containing "International" is the only case that actually tests it.
    expect(keeps("International Trends in Malolactic Fermentation")).toBe(true);
    expect(drops("Viticulture and Enology Interns")).toBe(true);
  });

  it("drops publication and admin housekeeping", () => {
    expect(drops("Winery Planning and Design CD, Edition 14 Available")).toBe(true);
    expect(drops("Méthode Champenoise publication available")).toBe(true);
    expect(drops("Délestage Publication Online")).toBe(true);
    expect(drops("New Web Site Domain Address")).toBe(true);
    expect(drops("EnologyAccess.org")).toBe(true);
    expect(drops("New - Enology Notes Subject Index")).toBe(true);
    expect(drops("Budget Reduction")).toBe(true);
  });

  it("reports WHY it dropped, for the verify script's audit trail", () => {
    expect(classifySection("Wine Filtration Workshop, February 10").reason).toMatch(/event/i);
    expect(classifySection("In Remembrance").reason).toMatch(/personnel/i);
    expect(classifySection("Délestage Publication Online").reason).toMatch(/admin/i);
  });
});

describe("classifySection — KEEP: technical content", () => {
  it("keeps the technical sections that sit on the same pages as the drops", () => {
    expect(keeps("2. Wine Storage and Bottling Quality Control")).toBe(true);
    expect(keeps("5. Microbial Ecology during Vinification")).toBe(true);
    expect(keeps("1. Production Considerations for Rot-Degraded Fruit")).toBe(true);
    expect(keeps("2. A Review of Rot Metabolites")).toBe(true);
    expect(keeps("Polysaccharides and instability")).toBe(true);
    expect(keeps("I. Sauvignon blanc aroma/flavor.")).toBe(true);
  });

  it("keeps lab-service notices (USER RULING: they define the assay)", () => {
    expect(keeps("New Virginia Tech Enology Service Lab Offering: Sanitation Monitoring")).toBe(true);
    expect(keeps("Enology Service Lab Update")).toBe(true);
    expect(keeps("Laboratory Service Reminder")).toBe(true);
    expect(keeps("New Analytical Technologies")).toBe(true);
  });

  it("keeps an admin-titled section when a colon carries real substance (USER RULING)", () => {
    expect(
      keeps("New On-Line Publications: Oxidation Sensory Screen - Hydrogen Sulfide/Mercaptan Sensory Screen"),
    ).toBe(true);
    expect(
      keeps(
        "New On-Line Publications: Electronic Nose Evaluation of Cabernet Sauvignon Grape Maturity, A Winemaker HACCP Plan",
      ),
    ).toBe(true);
  });

  it("does NOT let the colon rescue save an event or a personnel item", () => {
    // The rescue is scoped to the ADMIN genre only. Otherwise "Study Tour: Alsace, Burgundy and
    // Champagne" would survive on the strength of its right-hand side, which is the exact section
    // the user asked us to remove.
    expect(drops("The Technical Study Tour: Alsace, Burgundy and Champagne.")).toBe(true);
    expect(drops("Short Course: Tannin-Color Measurement and Management")).toBe(true);
    expect(drops("In Memory of: Dr. Keith Patterson")).toBe(true);
  });

  it("defaults to keep for anything unrecognized", () => {
    expect(keeps("Chill Cells and Cold Soaking")).toBe(true);
    expect(keeps("Timing")).toBe(true);
    expect(keeps("")).toBe(true);
  });
});

describe("classifySection — anti-regression: the four rejected patterns", () => {
  // Each of these words appears in the archive with BOTH meanings. Any of them used as a bare
  // pattern silently deletes real winemaking chemistry. Do not re-add them.

  it("/technical/i is semantically INVERTED here and must not be a pattern", () => {
    // "Technical" marks an EVENT in this archive. Those drop on `study tour` / `roundtable`,
    // never on the word itself -- so a genuinely technical title using it survives.
    expect(keeps("Technical Considerations for Malolactic Fermentation")).toBe(true);
    expect(drops("Volatile Sulfur Compound Technical Roundtable")).toBe(true);
  });

  it("/review/i must not be a pattern (literature reviews are technical)", () => {
    expect(keeps("Brettanomyces Review")).toBe(true);
    expect(keeps("Closure Review (continued): Flavor Scalping")).toBe(true);
    expect(keeps("Herbaceous Character in Red Wines - A Review")).toBe(true);
  });

  it("/sustainab(le|ility)/i must not be a pattern", () => {
    expect(
      keeps("Sustainable Winery Expansion - Conducting an Energy and Water Use Audit"),
    ).toBe(true);
  });

  it("bare /available/i must not be a pattern (YAN = 'available nitrogen')", () => {
    expect(keeps("Available Nitrogen and Stuck Fermentation")).toBe(true);
    expect(keeps("Measuring YAN, NH3 and Arginine")).toBe(true);
    // still drops when anchored to a publication/edition/CD
    expect(drops("Winery Planning and Design, Edition 16, Available.")).toBe(true);
  });

  it("bare /new/i must not be a pattern", () => {
    expect(keeps("New Analytical Technologies")).toBe(true);
  });

  it("bare /winery planning and design/i must not be a pattern", () => {
    // ad when suffixed 'Edition N, Available'; event when suffixed 'Workshop'; technical otherwise
    expect(drops("Winery Planning and Design, Edition 16, Available.")).toBe(true);
    expect(drops("Winery Planning, Design, and Expansion Workshop")).toBe(true);
    expect(keeps("Winery Planning and Design: Energy Use and the Wine Industry")).toBe(true);
  });

  it("/norton/i must not be a pattern (Norton is a grape variety)", () => {
    expect(keeps("Norton Phenolics and Acid Management")).toBe(true);
    expect(drops("Norton Roundtable")).toBe(true);
  });
});

describe("classifySection — prose is not a heading (found live on EN-159)", () => {
  // Regression. Anchor #1 on EN-159 has no bold title, so heading extraction swallowed a whole
  // paragraph. It mentions "On-Line Publications" in passing, which dropped a section actually
  // about fermentation considerations. Length is the discriminator: this is 207 chars, the longest
  // real non-technical heading in the corpus is 118.
  const PROSE =
    "In advance of the 2011 harvest, the following is an outline of some fermentation " +
    "considerations. Additional information is available on-line at www.vtwines.info . " +
    "Click Enology Notes or On-Line Publications.";

  it("keeps body prose that happens to mention an admin phrase", () => {
    expect(PROSE.length).toBeGreaterThan(150);
    expect(keeps(PROSE)).toBe(true);
    expect(classifySection(PROSE).reason).toMatch(/prose/i);
  });

  it("still drops the LONGEST real non-technical heading in the corpus", () => {
    const asev =
      "3. American Society for Enology and Viticulture – Eastern Section Conference and " +
      "Symposium, July 15-17, Lehigh Valley, PA";
    expect(normalizeHeading(asev).length).toBeLessThan(150);
    expect(drops(asev)).toBe(true);
  });
});

describe("classifySection — the accepted casualty", () => {
  it("drops 'Phenols and Mouthfeel, Wineries Unlimited 2011' (known false positive)", () => {
    // PLAN 084, recorded deliberately. The topic is technical but the trade-show suffix triggers
    // the event rule, and the separator is a comma so the colon rescue cannot apply. Bending the
    // rule to save this one title would require matching commas, which breaks
    // "Wine Filtration Workshop, February 10". Asserted so the trade-off stays visible.
    expect(drops("Phenols and Mouthfeel, Wineries Unlimited 2011")).toBe(true);
  });
});
