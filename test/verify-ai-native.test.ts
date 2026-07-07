import { describe, it, expect } from "vitest";
import { run, coreExports } from "../scripts/verify-ai-native.mjs";

// Meta-test for the AI-native core→tool guard. run() reads the real src tree, so we
// exercise gap-detection + the ratchet by overriding the allow-list, and we hammer the
// brittle export parser (council S4) with adversarial fixtures.

// run() builds a TS import graph over all of src on first call (then memoizes), so give
// the real-tree cases a generous timeout — they can be slow under a loaded parallel run.
const T = 30000;
const PANEL = "src/lib/ferment/panel-core.ts"; // the real unreached core we exercise against
describe("verify:ai-native — reachability + two-tier exemptions (real tree)", () => {
  it("passes with the committed exemptions (green on landing)", () => {
    expect(run().violations).toEqual([]);
  }, T);

  it("flags a real gap: unreached core in NEITHER map", () => {
    const { violations } = run({ internal: {}, gapAllowlist: {}, maxAllowed: 0 });
    expect(violations.some((v: string) => /panel-core\.ts.*NO assistant tool/.test(v))).toBe(true);
  }, T);

  it("INTERNAL is permanent — exempt even with MAX_ALLOWED=0", () => {
    // Exempt every real-tree unreached core so this case isolates the INTERNAL-permanence mechanism
    // (PANEL + the Phase-2 compliance cores whose assistant tools are a deferred fast-follow).
    const { violations } = run({
      internal: {
        [PANEL]: { owner: "x", reason: "internal sync core" },
        "src/lib/compliance/return-to-bond-core.ts": { owner: "x", reason: "phase-2 gap (test-local)" },
        "src/lib/compliance/tax-class-event-core.ts": { owner: "x", reason: "phase-2 gap (test-local)" },
      },
      gapAllowlist: {},
      maxAllowed: 0,
    });
    expect(violations).toEqual([]);
  }, T);

  it("GAP_ALLOWLIST ratchets: more gap entries than MAX_ALLOWED fails", () => {
    const { violations } = run({
      internal: {},
      gapAllowlist: { [PANEL]: { owner: "x", reason: "y", issue: "#1" } },
      maxAllowed: 0,
    });
    expect(violations.some((v: string) => /only shrinks|MAX_ALLOWED/.test(v))).toBe(true);
  }, T);

  it("rejects a stale GAP entry (no such core file)", () => {
    const { violations } = run({
      gapAllowlist: { "src/lib/ferment/does-not-exist-core.ts": { owner: "x", reason: "y", issue: "#1" } },
      maxAllowed: 1,
    });
    expect(violations.some((v: string) => /GAP_ALLOWLIST entry.*stale/.test(v))).toBe(true);
  }, T);

  it("rejects a stale INTERNAL entry (no such core file)", () => {
    const { violations } = run({
      internal: { "src/lib/ferment/does-not-exist-core.ts": { owner: "x", reason: "y" } },
      gapAllowlist: {},
      maxAllowed: 0,
    });
    expect(violations.some((v: string) => /INTERNAL entry.*stale/.test(v))).toBe(true);
  }, T);

  it("rejects a core listed in BOTH maps", () => {
    const { violations } = run({
      internal: { [PANEL]: { owner: "x", reason: "y" } },
      gapAllowlist: { [PANEL]: { owner: "x", reason: "y", issue: "#1" } },
      maxAllowed: 1,
    });
    expect(violations.some((v: string) => /in both INTERNAL and GAP_ALLOWLIST/.test(v))).toBe(true);
  }, T);

  it("requires owner + reason on a GAP entry", () => {
    const { violations } = run({
      internal: {},
      gapAllowlist: { [PANEL]: { owner: "x" } },
      maxAllowed: 1,
    });
    expect(violations.some((v: string) => /needs both `owner` and `reason`/.test(v))).toBe(true);
  }, T);
});

describe("coreExports — adversarial export parsing (council S4)", () => {
  const ex = (src: string) => coreExports("x.ts", src).sort();

  it("finds an exported function declaration", () => {
    expect(ex("export function fooCore() {}")).toEqual(["fooCore"]);
  });
  it("finds an exported async function", () => {
    expect(ex("export async function barCore() {}")).toEqual(["barCore"]);
  });
  it("finds an exported const arrow", () => {
    expect(ex("export const bazCore = () => {};")).toEqual(["bazCore"]);
  });
  it("finds an aliased named re-export (as xCore)", () => {
    expect(ex("const x = 1;\nexport { x as quxCore };")).toEqual(["quxCore"]);
  });
  it("handles a multiline signature", () => {
    expect(ex("export function multiCore(\n  a: number,\n  b: string,\n): void {}")).toEqual(["multiCore"]);
  });
  it("ignores a non-Core export", () => {
    expect(ex("export function notacore() {}\nexport const helper = 1;")).toEqual([]);
  });
  it("ignores a non-exported *Core (not part of the public surface)", () => {
    expect(ex("function localCore() {}")).toEqual([]);
  });
  it("finds multiple core exports in one file", () => {
    expect(ex("export function aCore(){}\nexport const bCore = 1;")).toEqual(["aCore", "bCore"]);
  });
});
