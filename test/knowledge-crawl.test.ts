import { describe, it, expect } from "vitest";
import { classifyContentType } from "@/lib/knowledge/crawl/fetcher";
import { isPrivateAddress } from "@/lib/knowledge/crawl/ssrf";
import { extractLinks, gateLinks, hostIsTrusted } from "@/lib/knowledge/crawl/link-gate";
import { isSoftNotFound, normalizeCrawlUrl } from "@/lib/knowledge/crawl/crawler";

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

// Plan 084 — 36 of the 98 PDFs linked from the Cornell grape site answer HTTP 200 with text/html
// because the host reorganized and now redirects to a landing page. All 34 grapesandwine.cals.cornell.edu
// links do this. Without the guard that is 34 copies of one nav page indexed as Cornell research.
describe("soft-404 detection (.pdf URL answering with HTML)", () => {
  it("flags a .pdf URL that came back as HTML", () => {
    expect(
      isSoftNotFound(
        "https://grapesandwine.cals.cornell.edu/sites/.../documents/GBM-Management.pdf",
        "html",
      ),
    ).toBe(true);
  });

  it("allows a .pdf URL that actually returned a PDF", () => {
    expect(isSoftNotFound("https://blogs.cornell.edu/grapes/x/report-2018.pdf", "pdf")).toBe(false);
  });

  it("leaves normal HTML pages alone", () => {
    expect(isSoftNotFound("https://blogs.cornell.edu/grapes/ipm/", "html")).toBe(false);
  });

  it("is case-insensitive on the extension and ignores the query string", () => {
    expect(isSoftNotFound("https://example.org/a/B/Report.PDF", "html")).toBe(true);
    expect(isSoftNotFound("https://example.org/a/report.pdf?download=1", "html")).toBe(true);
  });

  it("does not flag a URL that merely mentions pdf in a path segment or query", () => {
    expect(isSoftNotFound("https://example.org/pdf/guide", "html")).toBe(false);
    expect(isSoftNotFound("https://example.org/guide?format=pdf", "html")).toBe(false);
  });

  it("returns false for a malformed URL instead of throwing", () => {
    expect(isSoftNotFound("not a url", "html")).toBe(false);
  });

  it("never flags content classified as other (that path is already skipped)", () => {
    expect(isSoftNotFound("https://example.org/x.pdf", "other")).toBe(false);
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
