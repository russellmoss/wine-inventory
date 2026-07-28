/**
 * ConfirmButton (AC-C7, AC-C8) and the four Phase-1 primitives
 * (AC-C11, AC-C12, AC-C17).
 *
 * No jsdom in this repo, so these are source-contract assertions plus a
 * whole-codebase call-site sweep. The behavioural half — the 6-second arm test the
 * AC literally describes — needs a DOM and lives in test/e2e/phase1-a11y.spec.ts.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const UI = join(SRC, "components", "ui");

function read(rel: string): string {
  return readFileSync(join(UI, rel), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const ALL_SRC = walk(SRC).map((p) => ({ rel: p.slice(SRC.length + 1).replace(/\\/g, "/"), text: readFileSync(p, "utf8") }));

/**
 * Every `<ConfirmButton ...>` opening tag in a file.
 *
 * A regex cannot do this: the props contain arrow functions, so the first `>` in
 * `onConfirm={() => ...}` is not the end of the tag. Track brace depth instead.
 */
function openingTags(text: string, tag: string): string[] {
  const out: string[] = [];
  const marker = `<${tag}`;
  for (let i = text.indexOf(marker); i !== -1; i = text.indexOf(marker, i + 1)) {
    let depth = 0;
    for (let j = i + marker.length; j < text.length; j++) {
      const c = text[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) {
        out.push(text.slice(i, j + 1));
        break;
      }
    }
  }
  return out;
}

describe("AC-C7 — ConfirmButton never auto-disarms", () => {
  const src = read("ConfirmButton.tsx");

  it("has no timer at all", () => {
    // The 4-second setTimeout was a WCAG 2.2.1 failure: an arbitrary time limit on
    // completing an action while the user is still engaged. Any timer here is the bug.
    expect(src).not.toMatch(/setTimeout|setInterval/);
  });

  it("disarms on events the user has left the screen, not on a clock", () => {
    expect(src).toContain('document.addEventListener("visibilitychange"');
    expect(src).toContain('window.addEventListener("pagehide"');
    expect(src).toContain('e.key === "Escape"');
  });

  it("removes every listener it adds", () => {
    const added = (src.match(/addEventListener/g) ?? []).length;
    const removed = (src.match(/removeEventListener/g) ?? []).length;
    expect(removed).toBe(added);
  });

  it("keeps the always-visible inline Cancel escape hatch", () => {
    expect(src).toContain("Cancel");
  });
});

describe("AC-C8 — ConfirmButton's label names its object", () => {
  it("has no default label to fall back to", () => {
    const src = read("ConfirmButton.tsx");
    expect(src).toContain("confirmLabel: string;");
    expect(src).not.toMatch(/confirmLabel\s*=\s*"/);
    expect(src).not.toMatch(/confirmLabel\?:/);
  });

  it("every call site in src/ passes one", () => {
    const missing: string[] = [];
    for (const f of ALL_SRC) {
      if (f.rel === "components/ui/ConfirmButton.tsx") continue;
      for (const tag of openingTags(f.text, "ConfirmButton")) {
        if (!tag.includes("confirmLabel")) missing.push(f.rel);
      }
    }
    expect(missing).toEqual([]);
  });

  it("no call site passes a bare verb with no object", () => {
    // "Delete" / "Confirm" / "OK" tell a user nothing about what is about to happen.
    const bare = /confirmLabel="(Delete|Confirm|OK|Yes|Remove|Save)"/;
    expect(ALL_SRC.filter((f) => bare.test(f.text)).map((f) => f.rel)).toEqual([]);
  });
});

describe("AC-C11 — Skeleton reserves the resolved element's box", () => {
  const src = read("Skeleton.tsx");

  it("takes explicit width and height so nothing shifts on resolve", () => {
    expect(src).toContain("width?: number | string;");
    expect(src).toContain("height?: number | string;");
  });

  it("pulses in CSS, not JS, so the global reduced-motion rule covers it", () => {
    expect(src).toContain('className="ds-skeleton"');
    expect(src).not.toMatch(/requestAnimationFrame|setInterval/);
  });

  it("pairs the bars with a politely-announced text line", () => {
    expect(src).toContain('aria-live="polite"');
    expect(src).toContain('aria-hidden="true"');
  });
});

describe("AC-C12 — ActionReceipt persists until dismissed or superseded", () => {
  const src = read("ActionReceipt.tsx");

  it("is not time-dismissed — a ledger write deserves a receipt, not a flash", () => {
    expect(src).not.toMatch(/setTimeout|setInterval/);
  });

  it("is a status region and is focusable", () => {
    expect(src).toContain('role="status"');
    expect(src).toContain("tabIndex={-1}");
  });

  it("offers both the correction and the ledger line", () => {
    expect(src).toContain("Correct this entry");
    expect(src).toContain("See the ledger line");
  });

  it("keeps its actions at 48px and its dismiss at the touch floor", () => {
    expect(src).toContain("minHeight: 48");
    expect(src).toContain('width: "var(--touch-min)"');
  });
});

describe("Alert (v2 §B25)", () => {
  const src = read("Alert.tsx");

  it("interrupts for errors and does not for anything else", () => {
    expect(src).toContain('danger: { glyph: "✕", fg: "var(--red-ink)", bg: "var(--surface-tint-danger)", role: "alert" }');
    expect(src).toContain('role: "status"');
  });

  it("never signals by colour alone — every variant carries a glyph", () => {
    for (const v of ["info", "warning", "danger", "success"]) {
      expect(src).toMatch(new RegExp(`${v}: \\{ glyph: "`));
    }
  });

  it("uses the deep warning ink for body text on the warning tint", () => {
    // --text-secondary loses contrast against the golden wash.
    expect(src).toContain('var(--warning-deep-text)');
  });
});

describe("EmptyState (v2 §B30)", () => {
  it("takes actions — an empty state with no way forward is a dead end", () => {
    expect(read("EmptyState.tsx")).toContain("actions?: React.ReactNode;");
  });
});

describe("AC-C17 — everything Phase 1 ships has a /styleguide entry", () => {
  const guide = ALL_SRC.find((f) => f.rel === "app/styleguide/page.tsx")!.text;
  const SHIPPED = ["Button", "Badge", "StatusChip", "ConfirmButton", "Skeleton", "EmptyState", "Alert", "ActionReceipt"];

  it("previews each component this phase shipped or changed", () => {
    const missing = SHIPPED.filter((c) => !new RegExp(`<${c}\\b`).test(guide));
    expect(missing).toEqual([]);
  });

  it("exports each of them from the barrel", () => {
    const barrel = ALL_SRC.find((f) => f.rel === "components/ui/index.ts")!.text;
    const missing = SHIPPED.filter((c) => !barrel.includes(`export { ${c} }`));
    expect(missing).toEqual([]);
  });
});
