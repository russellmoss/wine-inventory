import { describe, it, expect } from "vitest";
import { sanitizePlainText, escapeHtml } from "@/lib/feedback/sanitize";

describe("sanitizePlainText", () => {
  it("keeps quotes and apostrophes literal (NO HTML entities)", () => {
    // Regression: the /developer feedback console renders this as a React text node, which
    // React already escapes. HTML-encoding here double-encodes and shows literal &#39; / &quot;.
    const out = sanitizePlainText(`click "edit" and it's fine`);
    expect(out).toBe(`click "edit" and it's fine`);
    expect(out).not.toContain("&quot;");
    expect(out).not.toContain("&#39;");
  });

  it("keeps &, <, > literal (no entity encoding)", () => {
    const out = sanitizePlainText("a & b < c > d");
    expect(out).toBe("a & b < c > d");
    expect(out).not.toContain("&amp;");
  });

  it("returns empty string for null / undefined", () => {
    expect(sanitizePlainText(null)).toBe("");
    expect(sanitizePlainText(undefined)).toBe("");
  });

  it("caps to max length", () => {
    expect(sanitizePlainText("abcdefghij", 4)).toBe("abcd");
  });

  it("keeps tab, newline, and carriage return", () => {
    const s = "line1\n\tindented\r\nline2";
    expect(sanitizePlainText(s)).toBe(s);
  });

  it("strips other control characters (NUL, BEL, DEL)", () => {
    const s = `a${String.fromCharCode(0)}b${String.fromCharCode(7)}c${String.fromCharCode(127)}d`;
    expect(sanitizePlainText(s)).toBe("abcd");
  });

  it("preserves the bug-triage note separator so the timeline still parses", () => {
    const s = "[bug-triage 2026-07-14T00:00:00.000Z] [defect] Fixed it.\n\n---\nolder note";
    expect(sanitizePlainText(s)).toBe(s);
  });
});

describe("escapeHtml (unchanged — for raw HTML sinks only)", () => {
  it("still escapes for HTML contexts", () => {
    expect(escapeHtml(`"x" & <y> 'z'`)).toBe("&quot;x&quot; &amp; &lt;y&gt; &#39;z&#39;");
  });
});
