import { describe, it, expect } from "vitest";
import { X509Certificate } from "node:crypto";
import tls from "node:tls";
import { EXTRA_INTERMEDIATE_CERTS, crawlCaBundle, crawlDispatcher } from "@/lib/knowledge/crawl/tls";

// These run offline. They cannot prove a handshake succeeds — only a live fetch does that — but they
// DO catch the ways this file silently rots: a corrupted paste, an expired intermediate, or someone
// "simplifying" crawlCaBundle() into dropping Node's roots (which would break TLS for all 21 sources
// while fixing one).
describe("crawler extra CA bundle", () => {
  it("every embedded cert parses as X.509", () => {
    expect(EXTRA_INTERMEDIATE_CERTS.length).toBeGreaterThan(0);
    for (const pem of EXTRA_INTERMEDIATE_CERTS) {
      expect(() => new X509Certificate(pem)).not.toThrow();
    }
  });

  it("embeds the Sectigo intermediate that ives-technicalreviews.eu omits", () => {
    const cert = new X509Certificate(EXTRA_INTERMEDIATE_CERTS[0]);
    expect(cert.subject).toContain("Sectigo Public Server Authentication CA DV R36");
    // Issued by a root already in Node's bundle — that is what makes this safe rather than a new
    // trust anchor. If this ever changes, the entry needs re-justifying, not just updating.
    expect(cert.issuer).toContain("Sectigo Public Server Authentication Root R46");
    expect(cert.ca).toBe(true);
  });

  it("no embedded cert is expired", () => {
    // An expired intermediate silently stops fixing the chain; the failure would look like the
    // publisher's site going down rather than this file going stale.
    const now = Date.now();
    for (const pem of EXTRA_INTERMEDIATE_CERTS) {
      const cert = new X509Certificate(pem);
      expect(Date.parse(cert.validTo)).toBeGreaterThan(now);
      expect(Date.parse(cert.validFrom)).toBeLessThan(now);
    }
  });

  it("ADDS to Node's roots rather than replacing them", () => {
    // undici's connect.ca REPLACES the default store. Dropping the spread would break TLS for every
    // other source in the corpus, and only against hosts that are configured CORRECTLY — so the
    // regression would look like "the well-behaved publishers all went down at once".
    const bundle = crawlCaBundle();
    expect(bundle.length).toBe(tls.rootCertificates.length + EXTRA_INTERMEDIATE_CERTS.length);
    for (const root of tls.rootCertificates) expect(bundle).toContain(root);
    for (const extra of EXTRA_INTERMEDIATE_CERTS) expect(bundle).toContain(extra);
  });

  it("memoizes the dispatcher so a crawl keeps one connection pool", () => {
    expect(crawlDispatcher()).toBe(crawlDispatcher());
  });
});
