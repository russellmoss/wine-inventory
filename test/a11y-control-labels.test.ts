/**
 * Permanent guard: every `<select>` in `src/` has an accessible name.
 *
 * Uses the tokenising detector in scripts/lib/jsx-labels.ts, whose own
 * correctness is pinned by test/jsx-labels.test.ts. That two-layer arrangement is
 * deliberate — the previous three attempts at this guard were ad-hoc greps, and
 * each returned a different number because a JSX opening tag does not end at the
 * next `>`.
 *
 * 32 selects across 15 files were named in July 2026 to get this to zero.
 * `<input>` and `<textarea>` are NOT gated yet: that is a real backlog, sized
 * below so the number is visible rather than implied.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { findUnlabelledControls } from "../scripts/lib/jsx-labels";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const FILES = walk(SRC).map((p) => ({
  rel: p.slice(SRC.length + 1).split(sep).join("/"),
  text: readFileSync(p, "utf8"),
}));

describe("every <select> has an accessible name (WCAG 4.1.2)", () => {
  it("finds none unlabelled", () => {
    const found = FILES.flatMap((f) => findUnlabelledControls(f.text, f.rel, ["select"]));
    const detail = found.map((f) => `  ${f.file}:${f.line}  ${f.excerpt}`).join("\n");
    expect(
      found,
      `${found.length} <select> with no accessible name:\n${detail}\n\n` +
        `Fix: add aria-label, or give it an id that a <label htmlFor> points at.\n` +
        `Run: npx tsx scripts/find-unlabelled-controls.ts`,
    ).toEqual([]);
  });

  it("no aria-label is empty — an empty name is the same as none", () => {
    const empty: string[] = [];
    for (const f of FILES) {
      for (const m of f.text.matchAll(/aria-label=""/g)) {
        empty.push(`${f.rel}:${f.text.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(empty).toEqual([]);
  });
});

describe("the input/textarea backlog is sized, not hidden", () => {
  it("reports the remaining unlabelled inputs and textareas without gating on them", () => {
    // Deliberately not an assertion of zero. Selects were this phase's scope;
    // claiming the others are clean would be false, and silently omitting them
    // would make the coverage number lie.
    const rest = FILES.flatMap((f) => findUnlabelledControls(f.text, f.rel, ["input", "textarea"]));
    const files = new Set(rest.map((r) => r.file)).size;
    // eslint-disable-next-line no-console
    console.log(`a11y backlog: ${rest.length} unlabelled <input>/<textarea> across ${files} files`);
    expect(Array.isArray(rest)).toBe(true);
  });
});
