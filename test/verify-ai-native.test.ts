import { describe, it, expect } from "vitest";
import { run, coreExports } from "../scripts/verify-ai-native.mjs";

// Meta-test for the AI-native core→tool guard. run() reads the real src tree, so we
// exercise gap-detection + the ratchet by overriding the allow-list, and we hammer the
// brittle export parser (council S4) with adversarial fixtures.

// run() builds a TS import graph over all of src on first call (then memoizes), so give
// the real-tree cases a generous timeout — they can be slow under a loaded parallel run.
const T = 30000;
describe("verify:ai-native — reachability + ratchet (real tree)", () => {
  it("passes with the committed allow-list (green on landing)", () => {
    expect(run().violations).toEqual([]);
  }, T);

  it("detects the real gap when the allow-list is emptied", () => {
    // panel-core has no assistant tool; with an empty allow-list it must be a violation.
    const { violations } = run({ allowlist: {}, maxAllowed: 0 });
    expect(violations.some((v: string) => /panel-core\.ts.*NO assistant tool/.test(v))).toBe(true);
  }, T);

  it("enforces the ratchet: allow-list larger than MAX_ALLOWED fails", () => {
    const { violations } = run({
      allowlist: { "src/lib/ferment/panel-core.ts": { owner: "x", reason: "y" } },
      maxAllowed: 0,
    });
    expect(violations.some((v: string) => /only shrinks|MAX_ALLOWED/.test(v))).toBe(true);
  }, T);

  it("rejects a stale allow-list entry (no such core file)", () => {
    const { violations } = run({
      allowlist: { "src/lib/ferment/does-not-exist-core.ts": { owner: "x", reason: "y" } },
      maxAllowed: 1,
    });
    expect(violations.some((v: string) => /stale/.test(v))).toBe(true);
  }, T);

  it("requires owner + reason on an allow-list entry", () => {
    const { violations } = run({
      allowlist: { "src/lib/ferment/panel-core.ts": { owner: "x" } },
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
