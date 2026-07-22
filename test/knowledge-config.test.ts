import { describe, it, expect } from "vitest";
import {
  KNOWLEDGE_SOURCES,
  TRUSTED_DOMAINS,
  TRUSTED_DOMAIN_SET,
  findSourceConfig,
  partitionSeededSources,
} from "@/lib/knowledge/config";
import { CURATED_SPECS, findCuratedSpec } from "@/lib/knowledge/curated-specs";
import { pathAllowed as crawlerPathAllowed } from "@/lib/knowledge/crawl/crawler";
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

  // Plan 084. blogs.cornell.edu is Cornell's ENTIRE university-wide WordPress multisite, so unlike every
  // other source in the registry, trusting the host does NOT bound the crawl — only allowPrefixes does.
  // A future "just allow /" edit would quietly point the crawler at thousands of unrelated Cornell blogs.
  describe("cornell-grapes multisite scoping", () => {
    const cornell = () => findSourceConfig("cornell-grapes")!;

    // Assert against the REAL crawler predicate, not a re-implementation of it. A test-local copy of the
    // rule would keep passing if the crawler's own rule drifted, which is the opposite of what a guard
    // on "does the crawl stay inside /grapes/" is for.
    const pathAllowed = (path: string) => crawlerPathAllowed(cornell(), `https://blogs.cornell.edu${path}`);

    it("never allows a bare root prefix", () => {
      expect(cornell().allowPrefixes).not.toContain("/");
    });

    it("allows the grape site and the sibling blog's FILE STORE only", () => {
      expect(pathAllowed("/grapes/ipm/diseases/")).toBe(true);
      expect(pathAllowed("/newfruit/files/2016/12/Canopy-Management-for-Hybrids-2007.pdf")).toBe(true);
      // the sibling blog's own pages are tree fruit and berries, not grapes
      expect(pathAllowed("/newfruit/")).toBe(false);
      expect(pathAllowed("/newfruit/apples/")).toBe(false);
    });

    it("refuses unrelated blogs on the same multisite", () => {
      for (const path of ["/", "/nutrition/", "/economics/", "/hort/", "/somerandomblog/2024/post/"]) {
        expect(pathAllowed(path)).toBe(false);
      }
    });

    it("refuses Cornell's hops and brewing programs, slashed OR unslashed", () => {
      // verify-knowledge-base.ts asserts a beer/IPA question surfaces nothing on-topic; wsu carries an
      // equivalent deny for its brewing certificate program.
      //
      // The unslashed forms matter: deny entries are written directory-style, but WordPress serves the
      // unslashed URL and 301s to the slashed one. A plain startsWith let /grapes/hops straight through.
      for (const p of ["/grapes/hops/", "/grapes/hops", "/grapes/brewing/", "/grapes/brewing"]) {
        expect(pathAllowed(p), p).toBe(false);
      }
    });

    it("refuses the unslashed form of every one of its deny prefixes", () => {
      for (const deny of cornell().denyPrefixes) {
        const unslashed = deny.endsWith("/") ? deny.slice(0, -1) : deny;
        expect(pathAllowed(unslashed), unslashed).toBe(false);
      }
    });

    it("refuses WordPress cruft and thin taxonomy archives", () => {
      for (const path of [
        "/grapes/wp-admin/",
        "/grapes/wp-json/",
        "/grapes/feed/",
        "/grapes/category/news/",
        "/grapes/tag/mildew/",
        "/grapes/author/someone/",
        "/grapes/page/3/",
      ]) {
        expect(pathAllowed(path)).toBe(false);
      }
    });

    it("its seed root is inside its own allow prefixes", () => {
      const cfg = cornell();
      for (const root of cfg.seedRoots) {
        const path = new URL(root).pathname;
        expect(cfg.allowPrefixes.some((p) => path.startsWith(p))).toBe(true);
      }
    });

    // Plan 087 — the CDN. Every blogs.cornell.edu upload 302s to CampusPress's SHARED CDN, so the
    // host allowlist alone would let this source reach every CampusPress blog on the internet. The
    // `/blogs.cornell.edu/` prefix is the CDN's per-customer namespace and is the ONLY thing bounding
    // it. These assertions are the safety argument, not bookkeeping.
    const cdnAllowed = (path: string) =>
      crawlerPathAllowed(cornell(), `https://bpb-us-e1.wpmucdn.com${path}`);

    it("trusts the CDN host — without it every Cornell PDF throws on the redirect hop", () => {
      expect(TRUSTED_DOMAIN_SET.has("bpb-us-e1.wpmucdn.com")).toBe(true);
    });

    it("admits a Cornell asset on the CDN (the real post-redirect url shape)", () => {
      expect(
        cdnAllowed("/blogs.cornell.edu/dist/0/7265/files/2017/01/Rootstocks-for-Planting-copy-rqw8ls.pdf"),
      ).toBe(true);
    });

    it("REFUSES another CampusPress customer on the same shared CDN", () => {
      // The whole reason the path prefix exists. If this ever passes, the source can crawl the
      // uploads of every university hosted by CampusPress.
      for (const p of [
        "/blogs.harvard.edu/dist/0/1/files/2020/01/something.pdf",
        "/sites.psu.edu/dist/0/1/files/2020/01/something.pdf",
        "/dist/0/7265/files/2017/01/orphaned.pdf",
        "/",
      ]) {
        expect(cdnAllowed(p), p).toBe(false);
      }
    });

    it("stays on the monthly auto-crawl loop", () => {
      // The monthly refresh comes from autoCrawl defaulting to true (recrawl-knowledge.ts filters on it),
      // NOT from crawlCadence, which nothing reads.
      expect(cornell().autoCrawl).not.toBe(false);
    });
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

// Plan 084 U5/U8 — generic registry invariants. Each of these encodes a failure mode that is silent:
// nothing crashes, the corpus is just quietly wrong or quietly short.
describe("knowledge registry integrity", () => {
  // The original version of this guard checked only `cornell-grapes` — and the OTHER source added in the
  // same commit, sitting on the same host, carried a bare "/". The guard was written for the wrong one.
  // Generalized so a shared host can never be paired with a wide-open prefix again.
  it("no source on a shared/multisite host carries a bare root allow prefix", () => {
    const SHARED_HOSTS = ["blogs.cornell.edu", "cornell.edu"];
    for (const s of KNOWLEDGE_SOURCES) {
      const hosts = [s.homeDomain, ...s.seedRoots.map((r) => new URL(r).hostname)];
      const onShared = hosts.some((h) => SHARED_HOSTS.some((sh) => h === sh || h.endsWith(`.${sh}`)));
      if (!onShared) continue;
      expect(s.allowPrefixes, `${s.key} is on a shared host and must not allow "/"`).not.toContain("/");
    }
  });

  it("no curated source is path-crawlable across a whole host", () => {
    // autoCrawl:false only says "the monthly loop skips me". An operator can still run
    // `crawl:source <key>` or put the key in KB_SOURCES, and both read allowPrefixes. A bare "/" there
    // turns that into a whole-site crawl under this source's byline. Narrow prefixes are fine — the
    // hazard is specifically the unbounded one.
    for (const s of KNOWLEDGE_SOURCES) {
      if (s.autoCrawl !== false) continue;
      expect(s.allowPrefixes, `curated source ${s.key} must not allow "/"`).not.toContain("/");
    }
  });

  it("viticulture-extension-refs declares NO crawlable paths at all", () => {
    // Its six trusted hosts are whole extension sites covering tree fruit, berries and field crops, and
    // its documents are reachable only by explicit URL. Empty fails closed.
    expect(findSourceConfig("viticulture-extension-refs")!.allowPrefixes).toEqual([]);
  });

  it("source keys are unique", () => {
    const keys = KNOWLEDGE_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // A curated source is reachable by exactly two mechanisms, and the registry records neither:
  // a declarative CURATED_SPECS entry (driven by scripts/crawl-curated.ts), or a bespoke script for a
  // source whose shape a spec cannot express. These five are the bespoke ones. Listing them here is the
  // point: adding a curated source now forces a conscious choice between the two, instead of producing
  // a source that is registered, toggleable in Settings, and permanently empty because nothing crawls it.
  const SCRIPT_BACKED_CURATED = new Set([
    "osu-owri", // scripts/crawl-owri.ts — ScholarsArchive paginated listing walk
    "osu-extension", // scripts/crawl-osu-extension.ts
    "scott-labs", // scripts/crawl-scott-labs.ts
    "ets", // scripts/crawl-ets.ts — a JSON API, not a crawl at all
    // scripts/crawl-ives.ts — OAI-PMH enumeration. Both sitemap probes 404 and /issue/archive
    // client-renders its issue list, so sitemap discovery and link-following would between them reach
    // ~11 of 209 articles. This guard caught the source the moment it went defaultEnabled:true (while
    // it was still false it read as DORMANT and was skipped) — exactly the conscious choice it exists
    // to force.
    "ives-technical-reviews",
  ]);

  it("every curated (autoCrawl:false) source is reachable by SOME operator path", () => {
    for (const s of KNOWLEDGE_SOURCES) {
      if (s.autoCrawl !== false) continue;
      if (SCRIPT_BACKED_CURATED.has(s.key)) continue;
      // DORMANT is not CURATED. A source that is autoCrawl:false AND defaultEnabled:false is switched
      // off deliberately, not populated by an operator script -- msu-grapes is off because MSU's bot
      // wall refuses every network we have (plan 085), so demanding a crawl path for it asserts the
      // opposite of the intent. The paired assertion in the msu describe block is what keeps it honest.
      if (s.defaultEnabled === false) continue;
      expect(
        findCuratedSpec(s.key),
        `curated source "${s.key}" has no CURATED_SPECS entry and is not listed as script-backed — nothing can crawl it`,
      ).toBeDefined();
    }
  });

  it("the script-backed list does not name a source that has since gained a spec", () => {
    // Keeps the list above honest: if someone converts a bespoke script to a declarative spec, the
    // stale exemption should fail rather than silently weaken the invariant.
    for (const key of SCRIPT_BACKED_CURATED) {
      expect(findSourceConfig(key), `script-backed list names unknown source "${key}"`).toBeDefined();
      expect(findCuratedSpec(key), `"${key}" now has a spec — remove it from SCRIPT_BACKED_CURATED`).toBeUndefined();
    }
  });

  it("every curated spec points at a real source that is actually curated", () => {
    for (const spec of CURATED_SPECS) {
      const cfg = findSourceConfig(spec.sourceKey);
      expect(cfg, `curated spec "${spec.sourceKey}" has no source config`).toBeDefined();
      expect(cfg!.autoCrawl, `spec "${spec.sourceKey}" is on an auto-crawled source`).toBe(false);
    }
  });

  it("every curated directUrls host is trusted, else crawlUrls silently drops it", () => {
    // crawlUrls gates on TRUSTED_DOMAIN_SET and counts a miss as summary.errors++ with no message, so
    // an untrusted host means those documents never arrive and nothing says why.
    for (const spec of CURATED_SPECS) {
      for (const url of spec.directUrls ?? []) {
        const host = new URL(url).hostname.toLowerCase();
        expect(TRUSTED_DOMAIN_SET.has(host), `${host} (from ${spec.sourceKey}) is not in TRUSTED_DOMAINS`).toBe(true);
      }
    }
  });

  it("every TRUSTED_DOMAINS sourceKey resolves to a real source", () => {
    for (const d of TRUSTED_DOMAINS) {
      if (d.sourceKey) {
        expect(findSourceConfig(d.sourceKey), `trusted domain ${d.domain} names unknown source "${d.sourceKey}"`).toBeDefined();
      }
    }
  });

  it("no curated spec silently ignores robots without an explanation", () => {
    // ignoreRobots is legitimate for a generic file-type block on public documents, but it is an
    // operator decision that must be visible. Cornell's sources must never set it: every host was
    // verified to permit the files, so there is nothing to bypass.
    for (const key of ["viticulture-extension-refs"]) {
      expect(findCuratedSpec(key)?.ignoreRobots).toBeUndefined();
    }
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
