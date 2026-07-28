/**
 * PageHeader, Breadcrumbs, IconButton, and the route-level loading/not-found
 * files (v2 §B4, §B5, §B7, §B29, §B30).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ui = (f: string) =>
  readFileSync(fileURLToPath(new URL(`../src/components/ui/${f}`, import.meta.url)), "utf8");

const APP = fileURLToPath(new URL("../src/app", import.meta.url));
const HEADER = ui("PageHeader.tsx");
const CRUMBS = ui("Breadcrumbs.tsx");
const ICON = ui("IconButton.tsx");
const GLOBALS = readFileSync(fileURLToPath(new URL("../src/app/globals.css", import.meta.url)), "utf8");

describe("PageHeader (v2 §B4)", () => {
  it("renders exactly one h1", () => {
    expect((HEADER.match(/<h1/g) ?? []).length).toBe(1);
  });

  it("keeps the summary as plain text, never a heading", () => {
    // A summary rendered as h2 lands in the heading outline and the page reads
    // as two titles to a screen reader.
    const summary = HEADER.slice(HEADER.indexOf("{summary ?"));
    expect(summary).toContain("<p");
    expect(summary).not.toMatch(/<h[1-6]/);
  });

  it("sizes the title from one class, not a hand-set number", () => {
    expect(HEADER).toContain('className="ds-page-title"');
    // Scope to the h1's own style block — the summary and meta legitimately set
    // their own sizes; it is the TITLE that must not be hand-set.
    const h1 = HEADER.slice(HEADER.indexOf("<h1"), HEADER.indexOf("</h1>"));
    expect(h1).not.toMatch(/fontSize/);
  });

  it("is 34px desktop and 30px below", () => {
    expect(GLOBALS).toContain(".ds-page-title { font-size: 34px; }");
    expect(GLOBALS).toMatch(/max-width: 767px[\s\S]*?\.ds-page-title \{ font-size: 30px; \}/);
  });

  it("stops the legacy !important clamp from overriding it", () => {
    // `.app-main h1 { font-size: 30px !important }` would otherwise win outright
    // and PageHeader could never control its own type.
    expect(GLOBALS).toContain(".app-main h1:not(.ds-page-title)");
  });
});

describe("Breadcrumbs (v2 §B5)", () => {
  it("is a labelled nav with an ordered list", () => {
    expect(CRUMBS).toContain('aria-label="Breadcrumb"');
    expect(CRUMBS).toContain("<ol");
  });

  it("marks the final crumb as the current page and does not link it", () => {
    expect(CRUMBS).toContain('aria-current="page"');
    const last = CRUMBS.slice(CRUMBS.indexOf("last ? ("), CRUMBS.indexOf("c.href ? ("));
    expect(last).not.toContain("<Link");
  });

  it("collapses the middle past 4 crumbs, keeping first and last two", () => {
    expect(CRUMBS).toContain("items.length > 4");
    expect(CRUMBS).toContain("items[items.length - 2]");
  });

  it("hides the separator and ellipsis from assistive tech", () => {
    expect((CRUMBS.match(/aria-hidden="true"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("IconButton (v2 §B7)", () => {
  it("makes aria-label required by the TYPE, not by convention", () => {
    expect(ICON).toContain('"aria-label": string;');
  });

  it("is 44x44 from the touch token", () => {
    expect(ICON).toContain('width: "var(--touch-min)"');
    expect(ICON).toContain('height: "var(--touch-min)"');
  });

  it("applies the focus ring after the caller's style", () => {
    const styleSpread = ICON.indexOf("...style,");
    const ring = ICON.indexOf("if (focusRing) merged.boxShadow");
    expect(ring).toBeGreaterThan(styleSpread);
  });

  it("hides the glyph from assistive tech — the aria-label is the name", () => {
    expect(ICON).toContain('aria-hidden="true"');
  });
});

describe("route-level loading and not-found (v2 §B29, §B30)", () => {
  function find(name: string): string[] {
    const out: string[] = [];
    (function walk(dir: string) {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (n === name) out.push(p);
      }
    })(APP);
    return out;
  }

  it("gives every heavy route a loading state — there was ONE across 65 routes", () => {
    expect(find("loading.tsx").length).toBeGreaterThanOrEqual(8);
  });

  it("gives route families a not-found — there were ZERO", () => {
    expect(find("not-found.tsx").length).toBeGreaterThanOrEqual(7);
  });

  it("every loading state uses Skeleton, so the box is reserved and CLS stays 0", () => {
    for (const p of find("loading.tsx")) {
      const src = readFileSync(p, "utf8");
      if (p.includes("developer")) continue; // predates this work
      expect(src, `${p} does not use Skeleton`).toContain("Skeleton");
    }
  });

  it("every not-found offers a way back — never a dead end", () => {
    for (const p of find("not-found.tsx")) {
      const src = readFileSync(p, "utf8");
      expect(src, `${p} has no action`).toContain("actions=");
    }
  });

  it("the work-orders loading label names what is loading", () => {
    const p = join(APP, "(app)", "work-orders", "loading.tsx");
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p, "utf8")).toContain("Loading your work orders…");
  });
});
