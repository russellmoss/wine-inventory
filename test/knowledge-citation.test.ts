import { describe, it, expect } from "vitest";
import { escapeHtml, renderTombstoneHtml } from "@/lib/knowledge/citation";

describe("citation tombstone rendering", () => {
  it("escapes untrusted crawled text (no HTML/script injection)", () => {
    const html = renderTombstoneHtml({
      kind: "tombstone",
      title: "Brett <script>alert(1)</script>",
      publisher: "AWRI",
      withdrawnAt: new Date("2026-01-15T00:00:00Z"),
      archivedText: "Sanitize at 85C </pre><script>evil()</script>",
      canonicalUrl: "https://awri.com.au/x",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<script>evil()</script>");
    expect(html).not.toContain("</pre><script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("2026-01-15");
    expect(html).toContain("withdrawn by the publisher");
  });

  it("escapeHtml handles the five entities", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});
