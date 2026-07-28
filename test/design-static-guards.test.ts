/**
 * Static design guards (Cellarhand v2, Phase 0/1).
 *
 * Cheap, permanent greps over `src/` for the things that are easy to reintroduce
 * by copy-paste and expensive to notice again. Modelled on the repo's existing
 * `verify:naming`-style static checks — the point is that a regression fails a
 * test run, not a design review six weeks later.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(full);
  }
  return out;
}

const FILES = walk(SRC).map((path) => ({ path, text: readFileSync(path, "utf8") }));

function hits(pattern: RegExp): string[] {
  return FILES.filter((f) => pattern.test(f.text)).map((f) => f.path.slice(SRC.length + 1).replace(/\\/g, "/"));
}

describe("font loading (AC-F10)", () => {
  it("never re-adds a render-blocking Google Fonts request", () => {
    // Inter + Inter Tight are self-hosted through next/font in src/app/layout.tsx.
    // A stray `@import url(fonts.googleapis.com)` or <link> puts a third-party
    // request back on the critical path — invisible locally, fatal on cellar wifi.
    // Matches a real URL (scheme or protocol-relative), not a prose mention of
    // the host in a comment explaining why it is gone.
    expect(hits(/(?:https?:)?\/\/fonts\.(?:googleapis|gstatic)\.com/)).toEqual([]);
  });
});
