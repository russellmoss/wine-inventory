import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// The guard is a pure-Node .mjs; import its pure run() directly (CLI is a thin wrapper).
import { run } from "../scripts/verify-parity-guards.mjs";

// Meta-test for the Capability-Parity guard. Evidence paths resolve against the REAL
// repo root (that's how the guard works), so we use `package.json` as a known-live file
// and a bogus path as a known-dead one. Fixtures are temp dirs, nothing committed.

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "parity-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function note(name: string, fm: Record<string, string>) {
  const body =
    "---\n" +
    Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n") +
    "\ntags:\n  - parity\n---\n\n# note\n";
  writeFileSync(join(dir, name), body, "utf8");
}

describe("verify:parity", () => {
  it("passes a covered note whose evidence resolves to a real repo file", () => {
    note("a.md", { id: "P-1", capability: "x", status: "covered", evidence: "package.json" });
    const { violations } = run(dir);
    expect(violations).toEqual([]);
  });

  it("accepts a path:line form on covered evidence", () => {
    note("a.md", { id: "P-1", capability: "x", status: "covered", evidence: "package.json:2" });
    expect(run(dir).violations).toEqual([]);
  });

  it("accepts a path:line:col form on covered evidence", () => {
    note("a.md", { id: "P-1", capability: "x", status: "covered", evidence: "package.json:2:5" });
    expect(run(dir).violations).toEqual([]);
  });

  it("reports a clean violation (not a crash) when covered evidence is blank", () => {
    // A blank `evidence:` used to parse to [] and crash resolveEvidence with a TypeError.
    note("a.md", { id: "P-EMPTY", capability: "x", status: "covered", evidence: "" });
    const { violations } = run(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/P-EMPTY.*no `evidence`/);
  });

  it("flags a covered note with a dead evidence path", () => {
    note("a.md", { id: "P-DEAD", capability: "x", status: "covered", evidence: "src/lib/does-not-exist.ts" });
    const { violations } = run(dir);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/P-DEAD.*does not exist/);
  });

  it("flags a covered note whose evidence is a wikilink", () => {
    note("a.md", { id: "P-WIKI", capability: "x", status: "covered", evidence: '"[[foo]]"' });
    expect(run(dir).violations[0]).toMatch(/wikilink/);
  });

  it("flags a covered note whose evidence escapes the repo root", () => {
    note("a.md", { id: "P-ESC", capability: "x", status: "covered", evidence: "../../../../etc/hosts" });
    expect(run(dir).violations[0]).toMatch(/escapes the repo root/);
  });

  it("flags an unknown status", () => {
    note("a.md", { id: "P-BAD", capability: "x", status: "maybe" });
    expect(run(dir).violations[0]).toMatch(/unknown `status/);
  });

  it("flags a note missing its id", () => {
    note("a.md", { capability: "x", status: "gap" });
    expect(run(dir).violations[0]).toMatch(/missing `id`/);
  });

  it("treats a dead link on a NON-covered note as a warning, not a violation", () => {
    note("a.md", { id: "P-GAP", capability: "x", status: "gap", evidence: "vintrace-docs/nope.md" });
    const { violations, warnings } = run(dir);
    expect(violations).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/P-GAP.*dead/);
  });
});
