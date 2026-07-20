import { describe, it, expect } from "vitest";
import {
  KNOWLEDGE_SOURCES,
  TRUSTED_DOMAIN_SET,
  findSourceConfig,
  partitionSeededSources,
} from "@/lib/knowledge/config";
import { expandQueryTerms } from "@/lib/knowledge/synonyms";

describe("knowledge source config", () => {
  it("has AWRI and Wine Australia as tier-1 sources", () => {
    const awri = findSourceConfig("awri");
    const wa = findSourceConfig("wine-australia");
    expect(awri?.tier).toBe(1);
    expect(wa?.tier).toBe(1);
    expect(awri?.publisher).toBe("AWRI");
  });

  it("AWRI DENIES the paywalled Technical Review path", () => {
    const awri = findSourceConfig("awri")!;
    expect(awri.denyPrefixes).toContain("/information_services/technical_review/latest_issue/");
    // and it is not accidentally in the allow list
    expect(
      awri.allowPrefixes.some((p) => p.startsWith("/information_services/technical_review")),
    ).toBe(false);
  });

  it("AWRI allow prefixes cover the three seed roots' paths", () => {
    const awri = findSourceConfig("awri")!;
    for (const root of awri.seedRoots) {
      const path = new URL(root).pathname;
      expect(awri.allowPrefixes.some((p) => path.startsWith(p))).toBe(true);
    }
  });

  it("every source's home domain is in the crawl allowlist", () => {
    for (const s of KNOWLEDGE_SOURCES) {
      expect(TRUSTED_DOMAIN_SET.has(s.homeDomain)).toBe(true);
    }
  });

  it("apex sources also trust their www host (subdomain hosts have no www form)", () => {
    // AWRI + Wine Australia pages link via the www host, so that variant must be followable too. Subdomain
    // hosts (wine.wsu.edu, ir.library.oregonstate.edu) have no meaningful www form, so this is per-source.
    for (const host of ["www.awri.com.au", "www.wineaustralia.com"]) {
      expect(TRUSTED_DOMAIN_SET.has(host)).toBe(true);
    }
  });
});

describe("VT Enology Notes source (plan 084)", () => {
  const vt = () => findSourceConfig("vt-enology-notes")!;

  it("is a tier-1 extension source with a cite-only license", () => {
    expect(vt().tier).toBe(1);
    expect(vt().publisher).toBe("Virginia Tech Enology");
    // the site asserts all-rights-reserved with no grant; provenance must say so per document
    expect(vt().license).toMatch(/all rights reserved/i);
    expect(vt().license).toMatch(/citation/i);
  });

  it("trusts BOTH hosts — without this the crawler refuses the host outright", () => {
    expect(TRUSTED_DOMAIN_SET.has("enology.fst.vt.edu")).toBe(true);
    expect(TRUSTED_DOMAIN_SET.has("www.enology.fst.vt.edu")).toBe(true);
  });

  it("stays on the MONTHLY SWEEP (autoCrawl must not be false)", () => {
    // USER REQUIREMENT. autoCrawl:false would exclude it from scripts/recrawl-knowledge.ts entirely,
    // which filters to `autoCrawl !== false`. The tempting "curated spec" route violates this.
    expect(vt().autoCrawl).not.toBe(false);
    expect(vt().crawlCadence).toBe("monthly");
  });

  it("declares the section filter — the whole reason this source needs code", () => {
    expect(vt().sectionFilter).toBe("anchor-heading");
  });

  it("is the ONLY source that declares a sectionFilter (blast-radius guard)", () => {
    // Adding sectionFilter to a source changes its stored indexedContentHash (deriveIndexHash
    // stops passing through), which forces a full re-embed of that source's slice of the
    // ~1,449-document corpus on the next monthly sweep. Nothing else in CI would catch that.
    expect(KNOWLEDGE_SOURCES.filter((s) => s.sectionFilter).map((s) => s.key)).toEqual([
      "vt-enology-notes",
    ]);
  });

  it("enumerates every issue so a 304 on an index page cannot stall discovery", () => {
    const roots = vt().seedRoots;
    expect(roots).toContain("https://enology.fst.vt.edu/EN/1.html");
    expect(roots).toContain("https://enology.fst.vt.edu/EN/166.html");
    expect(roots.filter((r) => /\/EN\/\d+\.html$/.test(r))).toHaveLength(166);
  });

  it("seeds the PDF-only notes, including #170's four section files", () => {
    const roots = vt().seedRoots;
    // #167-169 have no .html twin (they 404); #170 is published as _Sec1.._Sec4
    for (const n of [167, 168, 169]) {
      expect(roots).toContain(`https://enology.fst.vt.edu/downloads/EnologyNotes${n}.pdf`);
    }
    for (const sec of [1, 2, 3, 4]) {
      expect(roots).toContain(`https://enology.fst.vt.edu/downloads/EnologyNotes170_Sec${sec}.pdf`);
    }
  });

  it("allows the HTML issues and the PDF-only notes", () => {
    const allowed = (u: string) => {
      const p = new URL(u).pathname;
      return (
        !vt().denyPrefixes.some((d) => p.startsWith(d)) && vt().allowPrefixes.some((a) => p.startsWith(a))
      );
    };
    expect(allowed("https://enology.fst.vt.edu/EN/166.html")).toBe(true);
    expect(allowed("https://enology.fst.vt.edu/downloads/EnologyNotes167.pdf")).toBe(true);
    expect(allowed("https://enology.fst.vt.edu/downloads/EnologyNotes170_Sec3.pdf")).toBe(true);
  });

  it("REFUSES the PDF twins of pages we already ingest as filtered HTML", () => {
    // EnologyNotes165.pdf and 166.pdf are 200 and real. The PDF path cannot be section-filtered
    // (no anchors), so a blanket /downloads/ allow would re-import the study-tour ad and the staff
    // announcement as a second, UNFILTERED document -- silently undoing the whole feature.
    const allowed = (u: string) => {
      const p = new URL(u).pathname;
      return (
        !vt().denyPrefixes.some((d) => p.startsWith(d)) && vt().allowPrefixes.some((a) => p.startsWith(a))
      );
    };
    expect(allowed("https://enology.fst.vt.edu/downloads/EnologyNotes165.pdf")).toBe(false);
    expect(allowed("https://enology.fst.vt.edu/downloads/EnologyNotes166.pdf")).toBe(false);
    expect(allowed("https://enology.fst.vt.edu/downloads/EnologyNotes112.pdf")).toBe(false);
  });

  it("refuses the year index pages (navigation, not content)", () => {
    const p = "/EN/2013.html";
    expect(vt().denyPrefixes.some((d) => p.startsWith(d))).toBe(true);
    expect(vt().denyPrefixes.some((d) => "/EN/2000.html".startsWith(d))).toBe(true);
    // but a real issue that happens to look numeric is still fine
    expect(vt().denyPrefixes.some((d) => "/EN/166.html".startsWith(d))).toBe(false);
  });
});

describe("query synonym expansion (lexical arm)", () => {
  it("expands an acronym to its spelled-out form", () => {
    const out = expandQueryTerms("how much KMBS for my ferment");
    expect(out.toLowerCase()).toContain("potassium metabisulfite");
  });

  it("expands a spelled-out term to its acronym", () => {
    const out = expandQueryTerms("reverse osmosis for brett");
    expect(out.toLowerCase()).toContain("ro");
    expect(out.toLowerCase()).toContain("brettanomyces");
  });

  it("maps ppm to mg/L", () => {
    expect(expandQueryTerms("free SO2 in ppm").toLowerCase()).toContain("mg/l");
  });

  it("returns the query unchanged when no synonym matches", () => {
    expect(expandQueryTerms("harvest date planning")).toBe("harvest date planning");
  });
});

describe("MSU Extension Grapes source (plan 085)", () => {
  const msu = () => findSourceConfig("msu-grapes")!;

  it("resolves and is a tier-1 extension source", () => {
    expect(msu()).toBeTruthy();
    expect(msu().tier).toBe(1);
    expect(msu().homeDomain).toBe("canr.msu.edu");
  });

  // DORMANT, and these two assertions are a TRIPWIRE, not bookkeeping. Imperva refuses this crawler
  // from every network tried -- the operator's residential IP and GitHub Actions runners both
  // (verified: discovered 1, fetched 1, documents 0, skippedChallenge 1). Re-enabling autoCrawl puts
  // a permanently-challenged source back in the monthly sweep, where findDarkSources sees
  // "challenged + zero documents" and reds the job EVERY MONTH. Re-enabling defaultEnabled shows an
  // always-empty source in every tenant's Settings. Flip both only alongside evidence of a network
  // MSU will answer.
  it("is DORMANT — kept out of the monthly sweep because MSU is unreachable", () => {
    expect(msu().autoCrawl).toBe(false);
    expect(msu().crawlCadence).toBe("monthly"); // the intended cadence if it ever becomes reachable
  });

  it("is OFF by default — it can never have content, so it must not show as an enabled source", () => {
    expect(msu().defaultEnabled).toBe(false);
  });

  it("allowlists BOTH the apex and www — the site serves at www", () => {
    // Miss either and fetchDocument throws "host is not allowlisted" for every url of the source.
    expect(TRUSTED_DOMAIN_SET.has("canr.msu.edu")).toBe(true);
    expect(TRUSTED_DOMAIN_SET.has("www.canr.msu.edu")).toBe(true);
  });

  it("declares the linkedOnly rule that admits /news/ via /grapes/", () => {
    expect(msu().linkedOnlyPrefixes).toEqual([{ prefix: "/news/", linkedFrom: ["/grapes/"] }]);
  });

  it("is the ONLY source that declares linkedOnlyPrefixes (blast-radius guard)", () => {
    // linkedOnlyPrefixes changes how the SHARED crawl gate admits urls (crawler.ts decideAdmission),
    // which every source passes through. It is inert without the field, but a second source adopting
    // it should be a deliberate decision with its own provenance reasoning -- not something that
    // arrives unnoticed in a diff. Order-sensitive on purpose: adding one forces a test edit.
    expect(KNOWLEDGE_SOURCES.filter((s) => s.linkedOnlyPrefixes).map((s) => s.key)).toEqual(["msu-grapes"]);
  });

  it("does NOT declare a sectionFilter — MSU does not mix content within one url", () => {
    expect(msu().sectionFilter).toBeUndefined();
  });

  it("mirrors robots.txt and refuses the non-technical corners", () => {
    const p = msu().denyPrefixes;
    expect(p).toContain("/search"); // robots
    expect(p).toContain("/application/"); // robots
    expect(p).toContain("/grapes/wine_tourism/"); // tourism directory
    expect(p).toContain("/grapes/experts"); // staff bios
  });

  it("keeps denyPrefixes from shadowing the /grapes/ allow", () => {
    // denyPrefixes are checked FIRST and win unconditionally (no longest-match), so a bare "/grapes"
    // deny would silently kill the entire source.
    for (const d of msu().denyPrefixes) {
      expect("/grapes/viticulture/".startsWith(d)).toBe(false);
    }
  });

  it("seeds from the /grapes/ hub, not the viticulture subpage", () => {
    // The hub carries the news listing that feeds the linkedOnly rule, and /grapes/viticulture/ was
    // challenged by the WAF on every reconnaissance attempt.
    expect(msu().seedRoots).toEqual(["https://www.canr.msu.edu/grapes/"]);
  });
});

// The monthly sweep died in PRODUCTION on this. `virginia-fruit` was seeded into the global
// knowledge_source table from a branch that never merged; the old selection
// (`findSourceConfig(key)?.autoCrawl !== false`) reads `undefined !== false` as TRUE, so the
// unknown key was INCLUDED, and crawlWithFollowing's `if (!cfg) throw` then killed the run before
// a single page was fetched — taking all 21 sources' freshness with it.
//
// The DB and this registry drift apart by design: seeding runs from whatever checkout an operator
// is in. So the sweep has to tolerate a row it does not recognise.
describe("partitionSeededSources — the sweep must fail CLOSED on an unknown key", () => {
  it("routes an unknown key to `unknown`, never to `auto`", () => {
    const got = partitionSeededSources([{ key: "virginia-fruit" }]);
    expect(got.unknown).toEqual(["virginia-fruit"]);
    expect(got.auto).toEqual([]);
    expect(got.curated).toEqual([]);
  });

  it("still routes real sources correctly alongside an unknown one", () => {
    const got = partitionSeededSources([
      { key: "uc-ipm" }, // autoCrawl: true
      { key: "scott-labs" }, // autoCrawl: false -> curated
      { key: "not-a-real-source" },
    ]);
    expect(got.auto.map((s) => s.key)).toEqual(["uc-ipm"]);
    expect(got.curated.map((s) => s.key)).toEqual(["scott-labs"]);
    expect(got.unknown).toEqual(["not-a-real-source"]);
  });

  it("treats an omitted autoCrawl as auto (the default for most sources)", () => {
    // awri declares no autoCrawl field at all.
    expect(partitionSeededSources([{ key: "awri" }]).auto.map((s) => s.key)).toEqual(["awri"]);
  });

  it("preserves the row object, not just the key (callers need the id)", () => {
    const rows = [{ key: "uc-ipm", id: "src_123" }];
    expect(partitionSeededSources(rows).auto[0].id).toBe("src_123");
  });

  it("routes the DORMANT msu-grapes to curated, never auto", () => {
    // autoCrawl:false, so the sweep must not pick it up.
    const got = partitionSeededSources([{ key: "msu-grapes" }]);
    expect(got.auto).toEqual([]);
    expect(got.curated.map((s) => s.key)).toEqual(["msu-grapes"]);
    expect(got.unknown).toEqual([]);
  });

  it("handles an empty set", () => {
    expect(partitionSeededSources([])).toEqual({ auto: [], curated: [], unknown: [] });
  });
});
