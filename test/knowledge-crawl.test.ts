import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findSourceConfig } from "@/lib/knowledge/config";
import { classifyContentType } from "@/lib/knowledge/crawl/fetcher";
import { isPrivateAddress } from "@/lib/knowledge/crawl/ssrf";
import { extractLinks, gateLinks, hostIsTrusted } from "@/lib/knowledge/crawl/link-gate";
import { normalizeCrawlUrl, decideAdmission, pathAllowedAsLinkOnly } from "@/lib/knowledge/crawl/crawler";

describe("normalizeCrawlUrl (dedup link-followed URL variants)", () => {
  it("strips a trailing slash after a file-extension segment (dup of the file)", () => {
    expect(normalizeCrawlUrl("https://wine.wsu.edu/documents/2026/03/grape-rust-mites.pdf/")).toBe(
      "https://wine.wsu.edu/documents/2026/03/grape-rust-mites.pdf",
    );
  });
  it("leaves directory-style trailing slashes intact (AWRI relies on them)", () => {
    expect(normalizeCrawlUrl("https://www.awri.com.au/industry_support/winemaking_resources/")).toBe(
      "https://www.awri.com.au/industry_support/winemaking_resources/",
    );
  });
  it("drops the #fragment and preserves the query string", () => {
    expect(normalizeCrawlUrl("https://x.test/a.pdf/?v=2#frag")).toBe("https://x.test/a.pdf?v=2");
  });
});

describe("content-type detection (by header, not URL extension)", () => {
  it("classifies a getmedia GUID ?ext=.pdf served as application/pdf as PDF", () => {
    // Wine Australia PDFs live at getmedia/<guid>?ext=.pdf — the URL lies, the header is truth.
    expect(classifyContentType("application/pdf", Buffer.from("%PDF-1.5..."))).toBe("pdf");
  });
  it("classifies text/html as html", () => {
    expect(classifyContentType("text/html; charset=utf-8", Buffer.from("<html>..."))).toBe("html");
  });
  it("falls back to magic bytes when the header is missing/wrong", () => {
    expect(classifyContentType("", Buffer.from("%PDF-1.4 garbage"))).toBe("pdf");
    expect(classifyContentType("application/octet-stream", Buffer.from("<!DOCTYPE html><html>"))).toBe("html");
  });
  it("returns other for unknown content", () => {
    expect(classifyContentType("application/json", Buffer.from("{}"))).toBe("other");
  });
});

describe("SSRF private-address classification", () => {
  it("flags private/reserved IPv4", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "192.168.1.1", "172.16.5.5", "169.254.1.1", "100.64.0.1", "0.0.0.0"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });
  it("allows a public IPv4", () => {
    expect(isPrivateAddress("13.35.100.200")).toBe(false);
  });
  it("flags IPv6 loopback / ULA / link-local and unknown", () => {
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("fc00::1")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
    expect(isPrivateAddress("not-an-ip")).toBe(true);
  });
});

describe("allowlist-gated link following", () => {
  it("AWRI -> Wine Australia is followable; AWRI -> random blog is a candidate", () => {
    const html = `
      <a href="https://www.wineaustralia.com/growing-making/downy-mildew">WA guide</a>
      <a href="/industry_support/viticulture/agrochemicals/">AWRI internal</a>
      <a href="https://some-random-blog.example/post">random</a>
      <a href="mailto:helpdesk@awri.com.au">email</a>`;
    const links = extractLinks(html, "https://www.awri.com.au/industry_support/viticulture/pests-and-diseases/downy-mildew/");
    const gated = gateLinks(links, "https://www.awri.com.au/x");
    const followHosts = gated.followable.map((l) => new URL(l).hostname);
    expect(followHosts).toContain("www.wineaustralia.com");
    expect(followHosts).toContain("www.awri.com.au");
    expect(gated.candidateDomains.map((c) => c.domain)).toContain("some-random-blog.example");
    // the mailto: link is dropped, not treated as a candidate
    expect(gated.candidateDomains.some((c) => c.domain.includes("awri.com.au"))).toBe(false);
  });

  it("hostIsTrusted matches seeded domains only", () => {
    expect(hostIsTrusted("www.awri.com.au")).toBe(true);
    expect(hostIsTrusted("wineaustralia.com")).toBe(true);
    expect(hostIsTrusted("evil.example")).toBe(false);
  });
});

describe("redirect path re-gating (plan 084)", () => {
  // fetchDocument follows up to 5 redirects re-checking only the HOST. The crawl loops now re-run
  // the source's path rules against the FINAL url. This test pins the RULE the loops apply, so a
  // refactor that drops the re-gate has to delete an assertion rather than silently widen scope.
  const pathAllowedFor = (key: string, url: string) => {
    const cfg = findSourceConfig(key)!;
    const p = new URL(url).pathname;
    if (cfg.denyPrefixes.some((d) => p.startsWith(d))) return false;
    return cfg.allowPrefixes.some((a) => p.startsWith(a));
  };

  it("would reject a same-host redirect onto an excluded PDF twin", () => {
    // The scenario: /EN/166.html 302s to the PDF of the same issue. That PDF cannot be
    // section-filtered (no anchors), so ingesting it reimports the study-tour ad unfiltered.
    expect(pathAllowedFor("vt-enology-notes", "https://enology.fst.vt.edu/EN/166.html")).toBe(true);
    expect(
      pathAllowedFor("vt-enology-notes", "https://enology.fst.vt.edu/downloads/EnologyNotes166.pdf"),
    ).toBe(false);
  });

  it("still admits a redirect that stays inside the source's scope", () => {
    expect(pathAllowedFor("vt-enology-notes", "https://enology.fst.vt.edu/EN/165.html")).toBe(true);
    expect(
      pathAllowedFor("vt-enology-notes", "https://enology.fst.vt.edu/downloads/EnologyNotes167.pdf"),
    ).toBe(true);
  });

  it("rejects a redirect onto a denied year index", () => {
    expect(pathAllowedFor("vt-enology-notes", "https://enology.fst.vt.edu/EN/2013.html")).toBe(false);
  });

  it("denies the landing page and ALL five alphabetical index pages", () => {
    // Pure navigation. Verified in production: /EN/index.html indexed as 2 chunks of subject-index
    // links and truncated summaries, zero technical prose. crawl:source does not follow links, so
    // the five indexNN pages never appeared in the initial crawl — but the monthly sweep runs
    // crawlWithFollowing, which does, so they would have arrived silently on the 1st.
    for (const p of ["index.html", "indexae.html", "indexfj.html", "indexko.html", "indexpt.html", "indexuz.html"]) {
      expect(pathAllowedFor("vt-enology-notes", `https://enology.fst.vt.edu/EN/${p}`)).toBe(false);
    }
  });

  it("still admits every real issue page (no issue url starts with 'index')", () => {
    for (const n of [1, 40, 41, 112, 145, 165, 166]) {
      expect(pathAllowedFor("vt-enology-notes", `https://enology.fst.vt.edu/EN/${n}.html`)).toBe(true);
    }
  });
});

// Plan 085 — the challenge guard's ORDERING is the whole point, and it is not reachable by a unit
// test: crawlSource / crawlWithFollowing / crawlUrls all need Prisma + runAsSystem + live network,
// which is why none of them has ever had coverage. So this pins the ordering at the source level.
//
// It is a blunt instrument on purpose. The failure it prevents is silent and expensive: move the
// `res.challenge` check BELOW persistDocument and every WAF interstitial gets written to the GLOBAL
// corpus with a unique content hash, defeating the dedup and re-embedding forever. Nothing else in
// CI would notice. A refactor that reorders these has to delete an assertion, not just pass tests.
describe("challenge guard ordering (plan 085, source-level contract)", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../src/lib/knowledge/crawl/crawler.ts", import.meta.url)),
    "utf8",
  );

  it("checks res.challenge in all three crawl loops", () => {
    expect(src.match(/if \(res\.challenge\)/g) ?? []).toHaveLength(3);
  });

  it("skips the challenge BEFORE persisting, in every loop", () => {
    // Walk each persistDocument call and require a challenge guard between it and the previous one.
    const guards = [...src.matchAll(/if \(res\.challenge\)/g)].map((m) => m.index!);
    const persists = [...src.matchAll(/await persistDocument\(|= await persistDocument\(/g)].map((m) => m.index!);
    expect(persists.length).toBeGreaterThanOrEqual(3);
    for (const p of persists) {
      const guardBefore = guards.filter((g) => g < p).length;
      expect(guardBefore, `persistDocument at offset ${p} is not preceded by a challenge guard`).toBeGreaterThan(0);
    }
  });

  it("increments a per-source counter rather than swallowing the skip", () => {
    expect(src.match(/skippedChallenge\+\+/g) ?? []).toHaveLength(3);
  });
});

// Plan 085 — linkedOnlyPrefixes. MSU Extension's real viticulture articles live at flat
// /news/<slug> URLs, but /news/ is also every other MSU Extension programme (dairy, field crops,
// 4-H, forestry). No startsWith prefix separates them and there is no sitemap. What DOES separate
// them is provenance: the grape articles are the ones the /grapes/ pages link to.
//
// Tested against the REAL exported decision function rather than a hand-copied rule -- the older
// redirect-re-gate suite above had to re-implement its rule locally, and a re-implementation can
// drift from the thing it claims to pin.
describe("decideAdmission — linkedOnlyPrefixes (plan 085)", () => {
  const cfg = {
    key: "test-msu",
    publisher: "t",
    homeDomain: "canr.msu.edu",
    tier: 1,
    license: "t",
    seedRoots: ["https://www.canr.msu.edu/grapes/"],
    allowPrefixes: ["/grapes/"],
    linkedOnlyPrefixes: [{ prefix: "/news/", linkedFrom: ["/grapes/"] }],
    denyPrefixes: ["/search", "/grapes/wine_tourism/"],
    crawlCadence: "monthly",
    defaultEnabled: true,
  };
  const NEWS = "https://www.canr.msu.edu/news/cold-hardiness-of-grapevines";
  const FROM_GRAPES = "https://www.canr.msu.edu/grapes/viticulture/";

  it("admits a /news/ article linked from a /grapes/ page, and marks it terminal", () => {
    expect(decideAdmission(cfg, NEWS, FROM_GRAPES)).toEqual({ admit: true, terminal: true });
  });

  it("REFUSES the same article linked from another /news/ page (one hop only)", () => {
    // This is what keeps the dairy / 4-H / field-crop corpus out.
    expect(decideAdmission(cfg, NEWS, "https://www.canr.msu.edu/news/dairy-margins-2026")).toEqual({ admit: false });
  });

  it("REFUSES a /news/ article with no parent (seed root / sitemap entry)", () => {
    expect(decideAdmission(cfg, NEWS, null)).toEqual({ admit: false });
  });

  it("admits a /grapes/ page with or without a parent, NOT terminal (it may be followed)", () => {
    expect(decideAdmission(cfg, FROM_GRAPES, null)).toEqual({ admit: true, terminal: false });
    expect(decideAdmission(cfg, FROM_GRAPES, "https://www.canr.msu.edu/grapes/")).toEqual({
      admit: true,
      terminal: false,
    });
  });

  it("lets denyPrefixes win even when the linkedFrom parent qualifies", () => {
    expect(decideAdmission(cfg, "https://www.canr.msu.edu/search?q=x", FROM_GRAPES)).toEqual({ admit: false });
    expect(decideAdmission(cfg, "https://www.canr.msu.edu/grapes/wine_tourism/map", FROM_GRAPES)).toEqual({
      admit: false,
    });
  });

  it("is inert for a source that declares no linkedOnlyPrefixes", () => {
    // The other 20 sources must behave exactly as before: provenance is simply ignored.
    const plain = { ...cfg, linkedOnlyPrefixes: undefined };
    expect(decideAdmission(plain, NEWS, FROM_GRAPES)).toEqual({ admit: false });
    expect(decideAdmission(plain, FROM_GRAPES, null)).toEqual({ admit: true, terminal: false });
  });

  it("refuses an unparseable url rather than throwing", () => {
    expect(decideAdmission(cfg, "not a url", FROM_GRAPES)).toEqual({ admit: false });
    expect(decideAdmission(cfg, NEWS, "not a url")).toEqual({ admit: false });
  });
});

describe("pathAllowedAsLinkOnly — redirect re-gate for link-only items (plan 085)", () => {
  const cfg = {
    key: "test-msu", publisher: "t", homeDomain: "canr.msu.edu", tier: 1, license: "t",
    seedRoots: ["https://www.canr.msu.edu/grapes/"],
    allowPrefixes: ["/grapes/"],
    linkedOnlyPrefixes: [{ prefix: "/news/", linkedFrom: ["/grapes/"] }],
    denyPrefixes: ["/search"],
    crawlCadence: "monthly", defaultEnabled: true,
  };

  // Without this, a /news/ article that 301s (trailing slash, canonicalisation) would be dropped as
  // "redirect out of scope", because link-only paths are deliberately absent from allowPrefixes.
  it("accepts a redirect that lands on another link-only path", () => {
    expect(pathAllowedAsLinkOnly(cfg, "https://www.canr.msu.edu/news/cold-hardiness/")).toBe(true);
  });

  it("still refuses a denied path", () => {
    expect(pathAllowedAsLinkOnly(cfg, "https://www.canr.msu.edu/search?q=x")).toBe(false);
  });

  it("refuses a path that is not link-only at all", () => {
    expect(pathAllowedAsLinkOnly(cfg, "https://www.canr.msu.edu/dairy/feed")).toBe(false);
  });

  it("returns false for a source with no linkedOnlyPrefixes (never widens anyone else)", () => {
    expect(pathAllowedAsLinkOnly({ ...cfg, linkedOnlyPrefixes: undefined }, "https://www.canr.msu.edu/news/x")).toBe(
      false,
    );
  });
});
