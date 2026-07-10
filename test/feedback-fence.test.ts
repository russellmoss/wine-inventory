import { describe, it, expect } from "vitest";
import {
  fencePass,
  isDenied,
  isAllowed,
  normPath,
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
