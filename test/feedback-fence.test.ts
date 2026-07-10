import { describe, it, expect } from "vitest";
import {
  fencePass,
  isDenied,
  isAllowed,
  normPath,
  resolveDomainVerifies,
} from "../scripts/feedback-fence-rules";

describe("feedback write-fence: allowed surfaces", () => {
  it("accepts the original UI/assistant/feedback surfaces", () => {
    expect(fencePass("src/app/(app)/developer/page.tsx")).toBe(true);
    expect(fencePass("src/app/api/feedback/route.ts")).toBe(true);
    expect(fencePass("src/components/ui/Button.tsx")).toBe(true);
    expect(fencePass("src/lib/assistant/prompt.ts")).toBe(true);
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
