import { describe, it, expect } from "vitest";
import { canonicalPathKey, normalizeAllowPaths, allowPathsMatch } from "@/lib/knowledge/crawl/path-match";
import { pathAllowed, decideAdmission } from "@/lib/knowledge/crawl/crawler";
import { KNOWLEDGE_SOURCES, type KnowledgeSourceConfig } from "@/lib/knowledge/config";

/**
 * SKB Unit 5 — `allowPaths`, one negative test per clause of the canonicalization contract.
 *
 * Council S3's finding, verbatim in effect: an earlier draft said "slash-tolerant in both directions"
 * and left every other bypass undefined, so "the current test set does not cover the bypasses that
 * matter, and the suite can pass while the allowlist is still porous". Each clause below is a way the
 * gate could be walked past, written as a test rather than as a sentence.
 *
 * The stakes are concrete: Penn State's `/powdery-mildew` and `/downy-mildew` are the ORNAMENTAL /
 * tree-fruit articles at the same URL shape as the grape ones. A porous allowlist does not just admit
 * extra pages — it admits pages whose epidemiology is wrong for grapes, into a corpus a grower acts on.
 */

/** A PSU-shaped source: flat root slugs, no grape namespace, ornamental lookalikes at the same shape. */
function psuShaped(over: Partial<KnowledgeSourceConfig> = {}): KnowledgeSourceConfig {
  return {
    key: "test-flat-namespace",
    publisher: "Test Extension",
    homeDomain: "extension.test",
    tier: 1,
    license: "test",
    seedRoots: [],
    allowPrefixes: [],
    allowPaths: ["/grape-disease-black-rot", "/grape-disease-downy-mildew", "/grape-sour-rot"],
    denyPrefixes: ["/admin/", "/checkout/"],
    crawlCadence: "monthly",
    defaultEnabled: false,
    ...over,
  };
}

const at = (path: string) => `https://extension.test${path}`;

describe("canonicalPathKey — the contract, clause by clause", () => {
  it("TRAILING SLASH: `/x` and `/x/` are the same entry", () => {
    expect(canonicalPathKey("/grape-sour-rot/")).toBe(canonicalPathKey("/grape-sour-rot"));
    expect(canonicalPathKey("/grape-sour-rot///")).toBe(canonicalPathKey("/grape-sour-rot"));
  });

  it("TRAILING SLASH: the root is never stripped to empty", () => {
    expect(canonicalPathKey("/")).toBe("/");
  });

  it("CASE: comparison is case-SENSITIVE — paths are not domains", () => {
    expect(canonicalPathKey("/Grape-Sour-Rot")).not.toBe(canonicalPathKey("/grape-sour-rot"));
  });

  it("PERCENT-ENCODING: decodes once, so ordinary over-encoding compares equal", () => {
    expect(canonicalPathKey("/gr%61pe-sour-rot")).toBe(canonicalPathKey("/grape-sour-rot"));
  });

  it("PERCENT-ENCODING: `/a%2Fb` does NOT collapse to `/a/b` — an encoded separator is not a separator", () => {
    expect(canonicalPathKey("/a%2Fb")).not.toBe(canonicalPathKey("/a/b"));
  });

  it("PERCENT-ENCODING: a literal percent survives the round trip distinctly", () => {
    expect(canonicalPathKey("/a%25b")).not.toBe(canonicalPathKey("/a%2Fb"));
  });

  it("PERCENT-ENCODING: a malformed escape is compared raw rather than throwing", () => {
    expect(() => canonicalPathKey("/bad%zz")).not.toThrow();
    expect(canonicalPathKey("/bad%zz")).toBe("/bad%zz");
  });
});

describe("normalizeAllowPaths — a malformed entry is a STARTUP failure, not a silent no-match", () => {
  it("accepts absolute pathnames and normalises them", () => {
    const s = normalizeAllowPaths(["/a", "/b/"], "test");
    expect(s.has("/a")).toBe(true);
    expect(s.has("/b")).toBe(true);
  });

  it("throws on a missing leading slash — the silent-underrun case", () => {
    expect(() => normalizeAllowPaths(["grape-disease-black-rot"], "test")).toThrow(/absolute pathname/);
  });

  it("throws on a smuggled query or fragment", () => {
    expect(() => normalizeAllowPaths(["/x?y=1"], "test")).toThrow(/query or fragment/);
    expect(() => normalizeAllowPaths(["/x#frag"], "test")).toThrow(/query or fragment/);
  });

  it("throws on whitespace", () => {
    expect(() => normalizeAllowPaths(["/x y"], "test")).toThrow(/whitespace/);
  });

  it("names the source, so the failure says WHICH registry entry is wrong", () => {
    expect(() => normalizeAllowPaths(["bad"], "extension-psu")).toThrow(/extension-psu/);
  });

  it("every registered source's allowPaths already validates (this is what module load asserts)", () => {
    for (const s of KNOWLEDGE_SOURCES) {
      if (s.allowPaths) expect(() => normalizeAllowPaths(s.allowPaths!, s.key)).not.toThrow();
    }
  });
});

describe("allowPaths admission through the real crawler gate", () => {
  const cfg = psuShaped();

  it("admits an exact listed path", () => {
    expect(pathAllowed(cfg, at("/grape-disease-black-rot"))).toBe(true);
  });

  it("admits both the slashed and unslashed forms from ONE entry (the sitemap 301 case)", () => {
    expect(pathAllowed(cfg, at("/grape-disease-black-rot"))).toBe(true);
    expect(pathAllowed(cfg, at("/grape-disease-black-rot/"))).toBe(true);
  });

  it("REFUSES an ornamental lookalike at the identical URL shape", () => {
    for (const p of ["/powdery-mildew", "/downy-mildew", "/black-rot-and-frogeye-leaf-spot"]) {
      expect(pathAllowed(cfg, at(p)), p).toBe(false);
    }
  });

  it("REFUSES a path that merely starts with a listed one — exact means exact", () => {
    expect(pathAllowed(cfg, at("/grape-sour-rot-in-home-gardens"))).toBe(false);
    expect(pathAllowed(cfg, at("/grape-sour-rot/comments"))).toBe(false);
  });

  it("a query string or fragment cannot admit an unlisted path", () => {
    expect(pathAllowed(cfg, `${at("/powdery-mildew")}?x=/grape-sour-rot`)).toBe(false);
    expect(pathAllowed(cfg, `${at("/powdery-mildew")}#/grape-sour-rot`)).toBe(false);
  });

  it("a query string does NOT break admission of a listed path either", () => {
    expect(pathAllowed(cfg, `${at("/grape-sour-rot")}?utm_source=news`)).toBe(true);
  });

  it("`/a%2Fb` does not match a listed `/a/b`", () => {
    const encoded = psuShaped({ allowPaths: ["/a/b"] });
    expect(pathAllowed(encoded, at("/a/b"))).toBe(true);
    expect(pathAllowed(encoded, at("/a%2Fb"))).toBe(false);
  });

  it("denyPrefixes beat an allowPaths entry, unconditionally", () => {
    const conflicted = psuShaped({ allowPaths: ["/admin/grape-disease-black-rot"] });
    expect(pathAllowed(conflicted, at("/admin/grape-disease-black-rot"))).toBe(false);
  });

  it("FAILS CLOSED: allowPaths present with allowPrefixes:[] still refuses an unlisted path", () => {
    expect(cfg.allowPrefixes).toEqual([]);
    expect(pathAllowed(cfg, at("/anything-else"))).toBe(false);
    expect(pathAllowed(cfg, at("/"))).toBe(false);
  });

  it("admits IN ADDITION to allowPrefixes — neither mechanism disables the other", () => {
    const both = psuShaped({ allowPrefixes: ["/grape-and-wine-production/"] });
    expect(pathAllowed(both, at("/grape-and-wine-production/anything"))).toBe(true);
    expect(pathAllowed(both, at("/grape-sour-rot"))).toBe(true);
    expect(pathAllowed(both, at("/powdery-mildew"))).toBe(false);
  });

  it("survives a redirect from the slashed to the unslashed form", () => {
    // The crawl loops re-gate `res.finalUrl` through pathAllowed, so covering both forms here IS the
    // post-redirect clause. PSU's sitemap lists slashed and every one 301s to unslashed.
    expect(pathAllowed(cfg, at("/grape-disease-downy-mildew/"))).toBe(true);
    expect(pathAllowed(cfg, at("/grape-disease-downy-mildew"))).toBe(true);
  });

  it("decideAdmission agrees with pathAllowed for an allowPaths source, from a seed and from a link", () => {
    expect(decideAdmission(cfg, at("/grape-sour-rot"), null)).toEqual({ admit: true, terminal: false });
    expect(decideAdmission(cfg, at("/grape-sour-rot"), at("/hub"))).toEqual({ admit: true, terminal: false });
    expect(decideAdmission(cfg, at("/powdery-mildew"), at("/hub"))).toEqual({ admit: false });
  });

  it("a malformed URL is refused, not thrown on", () => {
    expect(() => pathAllowed(cfg, "not a url")).not.toThrow();
    expect(pathAllowed(cfg, "not a url")).toBe(false);
  });
});

describe("allowPathsMatch — the matcher in isolation", () => {
  it("is a no-op when the source declares no allowPaths (every incumbent)", () => {
    expect(allowPathsMatch(undefined, "/anything")).toBe(false);
    expect(allowPathsMatch([], "/anything")).toBe(false);
  });

  it("normalises BOTH sides, so a slashed ENTRY also admits the unslashed URL", () => {
    expect(allowPathsMatch(["/grape-sour-rot/"], "/grape-sour-rot")).toBe(true);
    expect(allowPathsMatch(["/grape-sour-rot"], "/grape-sour-rot/")).toBe(true);
  });
});

describe("no incumbent source's behaviour changed", () => {
  it("only SKB sources declare allowPaths — a pre-SKB incumbent adopting it is a deliberate, reviewed change", () => {
    // extension-psu (SKB Unit 6) and virginia-fruit (SKB Unit 7 — added AFTER the reconciliation
    // found a live --follow crawl under allowPrefixes:["/"] pulling in off-topic sibling-program
    // content) are both expected adopters, exactly as designed — the flat-slug/whole-host scoping
    // problem allowPaths exists to solve. If this list grows further, that is fine, but it means the
    // blast radius of a path-match change is no longer "SKB sources only" and this comment is stale.
    const adopters = KNOWLEDGE_SOURCES.filter((s) => s.allowPaths?.length).map((s) => s.key);
    expect(adopters).toEqual(["extension-psu", "virginia-fruit"]);
  });
});
