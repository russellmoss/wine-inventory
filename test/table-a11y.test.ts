/**
 * Every scrollable table is reachable from the keyboard (WCAG 2.1.1).
 *
 * `src/app/globals.css` gives any table NOT owned by `<ResponsiveTable>` a mobile
 * treatment of `display: block; overflow-x: auto` at ≤767px. That makes the `<table>`
 * element itself the scroll container — and a scroll container with no tab stop is a
 * region a mouse can pan and a keyboard cannot. axe calls it
 * `scrollable-region-focusable`, rates it serious, and it was firing on the phone
 * viewport of every route with a raw table. `ResponsiveTable` already does the right
 * thing on its wrapper; this holds the un-migrated ones to the same line.
 *
 * The CSS rule is documented as a shrink-to-zero migration ("DELETE this rule once no
 * `table:not([data-rt])` remains"). Until that lands, this is the pairing that keeps
 * the interim state honest rather than quietly inaccessible.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { code } from "./helpers/code";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Opening `<table …>` tags, with their attributes, one entry per occurrence. */
function tableTags(source: string): string[] {
  const tags: string[] = [];
  for (const m of source.matchAll(/<table(?=[\s>])/g)) {
    let depth = 0;
    let i = m.index + "<table".length;
    while (i < source.length) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
      i++;
    }
    tags.push(source.slice(m.index, i));
  }
  return tags;
}

describe("scrollable-region-focusable", () => {
  it("gives every raw <table> a tab stop", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const rel = file.slice(SRC.length + 1).split(sep).join("/");
      // ResponsiveTable owns its own scrolling on a wrapper and stamps data-rt, which
      // opts its table out of the legacy CSS entirely.
      if (rel === "components/ui/ResponsiveTable.tsx") continue;
      // Comments stripped first: this repo's static guards keep tripping over their
      // own documentation, and TimeSeriesChart's docstring says "renders a real
      // `<table>`" — prose, not markup.
      const source = code(readFileSync(file, "utf8"));
      for (const tag of tableTags(source)) {
        if (!tag.includes("tabIndex") && !tag.includes("data-rt")) offenders.push(rel);
      }
    }
    expect(
      [...new Set(offenders)],
      `these render a <table> that globals.css turns into a scroll container at 390px, ` +
        `with no way for a keyboard user to pan it. Add tabIndex={0}, or move the table ` +
        `to <ResponsiveTable>:\n` + [...new Set(offenders)].map((o) => `  ${o}`).join("\n"),
    ).toEqual([]);
  });

  it("keeps the CSS rule and this guard pointing at each other", () => {
    // If someone deletes the legacy rule (the stated end state), this guard should go
    // with it rather than linger as a rule nobody can explain.
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf8");
    expect(css).toContain(".app-main table:not([data-rt])");
    expect(css).toContain("test/table-a11y.test.ts");
  });

  it("is not vacuous — it rejects a table with no tab stop", () => {
    expect(tableTags('<table style={{ width: "100%" }}>')[0]).not.toContain("tabIndex");
    expect(tableTags("<table tabIndex={0}>")[0]).toContain("tabIndex");
    // The brace-aware scan must not stop at a `>` inside an expression attribute.
    expect(tableTags("<table style={{ a: x > 1 }} tabIndex={0}>")[0]).toContain("tabIndex");
  });
});
