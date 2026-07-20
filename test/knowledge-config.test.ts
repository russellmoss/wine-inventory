import { describe, it, expect } from "vitest";
import {
  KNOWLEDGE_SOURCES,
  TRUSTED_DOMAINS,
  TRUSTED_DOMAIN_SET,
  findSourceConfig,
} from "@/lib/knowledge/config";
import { CURATED_SPECS, findCuratedSpec } from "@/lib/knowledge/curated-specs";
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

    const pathAllowed = (path: string) => {
      const cfg = cornell();
      if (cfg.denyPrefixes.some((p) => path.startsWith(p))) return false;
      return cfg.allowPrefixes.some((p) => path.startsWith(p));
    };

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

    it("refuses Cornell's hops and brewing programs", () => {
      // verify-knowledge-base.ts asserts a beer/IPA question surfaces nothing on-topic; wsu carries an
      // equivalent deny for its brewing certificate program.
      expect(pathAllowed("/grapes/hops/")).toBe(false);
      expect(pathAllowed("/grapes/brewing/")).toBe(false);
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

// Plan 084 U5/U8 — generic registry invariants. Each of these encodes a failure mode that is silent:
// nothing crashes, the corpus is just quietly wrong or quietly short.
describe("knowledge registry integrity", () => {
  it("source keys are unique", () => {
    const keys = KNOWLEDGE_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // A curated source is reachable by exactly two mechanisms, and the registry records neither:
  // a declarative CURATED_SPECS entry (driven by scripts/crawl-curated.ts), or a bespoke script for a
  // source whose shape a spec cannot express. These four are the bespoke ones. Listing them here is the
  // point: adding a curated source now forces a conscious choice between the two, instead of producing
  // a source that is registered, toggleable in Settings, and permanently empty because nothing crawls it.
  const SCRIPT_BACKED_CURATED = new Set([
    "osu-owri", // scripts/crawl-owri.ts — ScholarsArchive paginated listing walk
    "osu-extension", // scripts/crawl-osu-extension.ts
    "scott-labs", // scripts/crawl-scott-labs.ts
    "ets", // scripts/crawl-ets.ts — a JSON API, not a crawl at all
  ]);

  it("every curated (autoCrawl:false) source is reachable by SOME operator path", () => {
    for (const s of KNOWLEDGE_SOURCES) {
      if (s.autoCrawl !== false) continue;
      if (SCRIPT_BACKED_CURATED.has(s.key)) continue;
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
