import { describe, it, expect } from "vitest";
import { findSourceConfig } from "@/lib/knowledge/config";
import { classifyContentType } from "@/lib/knowledge/crawl/fetcher";
import { isPrivateAddress } from "@/lib/knowledge/crawl/ssrf";
import { extractLinks, gateLinks, hostIsTrusted } from "@/lib/knowledge/crawl/link-gate";
import { normalizeCrawlUrl } from "@/lib/knowledge/crawl/crawler";

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
