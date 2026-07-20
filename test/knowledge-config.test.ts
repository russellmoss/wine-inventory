import { describe, it, expect } from "vitest";
import {
  KNOWLEDGE_SOURCES,
  TRUSTED_DOMAIN_SET,
  findSourceConfig,
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
