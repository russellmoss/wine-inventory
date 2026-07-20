import { describe, it, expect } from "vitest";
import {
  fencePass,
  isDenied,
  isAllowed,
  normPath,
  resolveDomainVerifies,
  evaluateTestGate,
  TEST_GATE_OVERRIDE_LABEL,
} from "../scripts/feedback-fence-rules";

describe("feedback write-fence: allowed surfaces", () => {
  it("accepts the original UI/assistant/feedback surfaces", () => {
    expect(fencePass("src/app/(app)/developer/page.tsx")).toBe(true);
    expect(fencePass("src/app/api/feedback/route.ts")).toBe(true);
    expect(fencePass("src/components/ui/Button.tsx")).toBe(true);
    expect(fencePass("src/lib/assistant/prompt.ts")).toBe(true);
  });

  it("accepts regression tests (a fix should carry its test; they run only in clean-context CI)", () => {
    expect(fencePass("test/work-order-nl-proposal.test.ts")).toBe(true);
    expect(fencePass("test/feedback-fence.test.ts")).toBe(true);
  });

  it("accepts the plan-052 cellar-floor server domains", () => {
    expect(fencePass("src/lib/work-orders/execute.ts")).toBe(true);
    expect(fencePass("src/lib/vessel/state.ts")).toBe(true);
    expect(fencePass("src/lib/lot/create.ts")).toBe(true);
    expect(fencePass("src/lib/chemistry/panel.ts")).toBe(true);
    expect(fencePass("src/lib/harvest/weigh-in.ts")).toBe(true);
    expect(fencePass("src/lib/bottling/materialize.ts")).toBe(true);
  });
});

describe("feedback write-fence: excluded-by-omission (money/ledger/moat)", () => {
  // These dirs are NOT in the allowlist and NOT in the denylist — they fail `isAllowed`,
  // so `fencePass` is false without needing a deny entry. This is the safety boundary.
  it.each([
    "src/lib/ledger/append.ts",
    "src/lib/cost/rollup.ts",
    "src/lib/money/format.ts",
    "src/lib/accounting/poster.ts",
    "src/lib/commerce/diff.ts",
    "src/lib/compliance/form-type.ts",
    "src/lib/transform/correct.ts",
    "src/lib/audit.ts",
  ])("rejects %s", (p) => {
    expect(isAllowed(p)).toBe(false);
    expect(fencePass(p)).toBe(false);
  });
});

describe("feedback write-fence: hard denies always win", () => {
  it.each([
    ".env",
    ".env.local",
    ".github/workflows/ci.yml",
    "prisma/schema.prisma",
    "prisma/migrations/0001_init/migration.sql",
    "src/lib/auth.ts",
    "src/lib/dal.ts",
    "src/lib/tenant/models.ts",
    "src/lib/prisma.ts",
  ])("denies %s", (p) => {
    expect(isDenied(p)).toBe(true);
    expect(fencePass(p)).toBe(false);
  });

  it("denies even a path that also looks allowed (denied beats allowed)", () => {
    // src/lib/tenant/ is denied even though src/lib/... domains are otherwise allowed.
    expect(fencePass("src/lib/tenant/context.ts")).toBe(false);
  });
});

describe("feedback write-fence: path normalization", () => {
  it("normalizes Windows separators and stray quotes before matching", () => {
    expect(fencePass(normPath('"src\\lib\\work-orders\\execute.ts"'))).toBe(true);
    expect(fencePass(normPath("src\\lib\\ledger\\append.ts"))).toBe(false);
  });
});

describe("domain-verify backstop: resolveDomainVerifies", () => {
  it("maps a work-orders edit to its runtime proofs", () => {
    const r = resolveDomainVerifies(["src/lib/work-orders/execute.ts"]);
    expect(r.scripts).toEqual(
      expect.arrayContaining(["verify:work-orders", "verify:work-orders-transform"]),
    );
    expect(r.provenDomains).toContain("src/lib/work-orders/");
    expect(r.unmappedDomains).toEqual([]);
  });

  it("maps a chemistry edit to verify:chemistry", () => {
    const r = resolveDomainVerifies(["src/lib/chemistry/panel.ts"]);
    expect(r.scripts).toEqual(["verify:chemistry"]);
    expect(r.unmappedDomains).toEqual([]);
  });

  it("treats pure-logic domains as proven with no scripts to run", () => {
    const r = resolveDomainVerifies(["src/lib/winemaking-calc/engine.ts"]);
    expect(r.scripts).toEqual([]);
    expect(r.provenDomains).toContain("src/lib/winemaking-calc/");
    expect(r.unmappedDomains).toEqual([]);
  });

  it("flags a widened-but-unmapped domain as needing human review", () => {
    const r = resolveDomainVerifies(["src/lib/vessel/state.ts", "src/lib/lot/create.ts"]);
    expect(r.unmappedDomains).toEqual(
      expect.arrayContaining(["src/lib/vessel/", "src/lib/lot/"]),
    );
    expect(r.scripts).toEqual([]);
  });

  it("ignores original UI/assistant surfaces (exempt from the domain-proof policy)", () => {
    const r = resolveDomainVerifies([
      "src/lib/assistant/prompt.ts",
      "src/components/ui/Button.tsx",
      "src/app/(app)/developer/page.tsx",
    ]);
    expect(r.scripts).toEqual([]);
    expect(r.provenDomains).toEqual([]);
    expect(r.unmappedDomains).toEqual([]);
  });

  it("ignores out-of-fence paths (the fence handles those, not this)", () => {
    const r = resolveDomainVerifies(["src/lib/ledger/append.ts", "src/lib/tenant/context.ts"]);
    expect(r.scripts).toEqual([]);
    expect(r.unmappedDomains).toEqual([]);
  });

  it("dedupes proofs across multiple files in the same domain", () => {
    const r = resolveDomainVerifies([
      "src/lib/work-orders/execute.ts",
      "src/lib/work-orders/reject.ts",
    ]);
    expect(r.scripts.filter((s) => s === "verify:work-orders")).toHaveLength(1);
  });
});

describe("regression-test gate", () => {
  it("fails a code-only fix — a fix without a test is a claim, not a proof", () => {
    const r = evaluateTestGate(["src/lib/assistant/resolve.ts", "src/components/ui/Picker.tsx"]);
    expect(r.missingTest).toBe(true);
    expect(r.codePaths).toHaveLength(2);
    expect(r.testPaths).toHaveLength(0);
  });

  it("passes when the fix carries a test alongside the code", () => {
    const r = evaluateTestGate(["src/lib/assistant/resolve.ts", "test/assistant-resolve.test.ts"]);
    expect(r.missingTest).toBe(false);
    expect(r.testPaths).toEqual(["test/assistant-resolve.test.ts"]);
  });

  it("passes a test-only diff (no code changed, nothing to prove)", () => {
    expect(evaluateTestGate(["test/assistant-resolve.test.ts"]).missingTest).toBe(false);
  });

  it("passes an empty diff", () => {
    expect(evaluateTestGate([]).missingTest).toBe(false);
    expect(evaluateTestGate(["", "  "]).missingTest).toBe(false);
  });

  it("ignores out-of-fence paths — a stray doc must never be what forces a test", () => {
    // The fence job owns out-of-fence paths; this gate must not double-report them.
    const r = evaluateTestGate(["docs/architecture/system-map.md", "README.md"]);
    expect(r.missingTest).toBe(false);
    expect(r.codePaths).toHaveLength(0);
  });

  it("still demands a test when a doc rides along with a real code change", () => {
    const r = evaluateTestGate(["docs/notes.md", "src/lib/vessel/state.ts"]);
    expect(r.missingTest).toBe(true);
    expect(r.codePaths).toEqual(["src/lib/vessel/state.ts"]);
  });

  it("normalizes Windows separators (git diff output is not always posix)", () => {
    const r = evaluateTestGate(["src\\lib\\vessel\\state.ts", "test\\vessel-state.test.ts"]);
    expect(r.missingTest).toBe(false);
    expect(r.codePaths).toEqual(["src/lib/vessel/state.ts"]);
  });

  it("keeps the override an explicit, human-visible label", () => {
    // Deliberately NOT agent-settable: the exception has to cost a person a click.
    expect(TEST_GATE_OVERRIDE_LABEL).toBe("no-regression-test");
  });
});
