/**
 * Shared write-fence for the feedback automation loop.
 *
 * ONE source of truth imported by BOTH the bug-fix agent (scripts/bug-feedback-agent.ts,
 * which decides what it may write) and the mechanical PR fence (scripts/verify-feedback-fence.ts,
 * which re-checks the resulting diff in CI). Keeping them in one place means the agent's
 * self-restriction and the CI gate can never drift apart.
 *
 * Scope decision (2026-07-09): broadened from the assistant-only allowlist to general app UI
 * so the bug-report loop can actually fix UI bugs (e.g. the developer console), while KEEPING
 * every hard security deny. Denied always wins over allowed.
 *
 * Scope decision (2026-07-10, plan 052): broadened again to the cellar-floor SERVER domains so
 * the loop can fix domain bugs (e.g. a work-order built with the wrong rollers-on split), not just
 * UI. The money/tenancy/ledger/compliance/moat domains stay OUT of this allowlist ON PURPOSE and
 * are NOT auto-fixable: ledger, cost, money, accounting, commerce, compliance, transform (kept out
 * by omission — they simply aren't listed), tenant/auth/dal/prisma (hard-denied below), and the
 * single file src/lib/audit.ts (audit-trail integrity is human-review-only). A fix that becomes
 * auto-merge-eligible must ALSO pass its domain's runtime proof — see `domainVerifyMap` +
 * the `feedback-domain-verify` CI job.
 */

// Never writable — the security-critical surfaces. A denied path fails the fence even if it
// also matches an allowed prefix.
export const deniedPrefixes = [
  ".env",
  ".github/workflows/",
  "prisma/migrations/",
  "prisma/schema.prisma",
  "src/lib/auth",
  "src/lib/dal",
  "src/lib/tenant/",
  "src/lib/prisma",
];

// Writable surfaces — app UI + components + the assistant + the feedback API + the cellar-floor
// SERVER domains + regression tests (test/). The money/tenancy/ledger/compliance/moat domains are deliberately absent
// (ledger, cost, money, accounting, commerce, compliance, transform) or hard-denied below
// (auth, dal, tenant, prisma) — plus src/lib/audit.ts, which is not under any allowed dir and so
// stays unwritable. Anything not listed here fails `isAllowed`, so the exclusions need no deny entry.
export const allowedPrefixes = [
  // UI + assistant + feedback API (original surfaces)
  "src/app/(app)/",
  "src/app/api/feedback/",
  "src/components/",
  "src/lib/assistant/",
  // Regression tests — a fix should carry its test. SAFE: test files run ONLY in the PR's
  // clean-context CI (the `check` job: vitest, no secrets), NEVER in the credentialed feedback-bug-fix
  // agent job (which writes files but runs no lint/test — the RCE boundary is unchanged). See
  // [[TRIP-SEC-FEEDBACK-FENCE]] / security-register.
  "test/",
  // Cellar-floor server domains (plan 052) — where real winemaking-ops bugs live
  "src/lib/work-orders/",
  "src/lib/vessel/",
  "src/lib/vessels/",
  "src/lib/lot/",
  "src/lib/blend/",
  "src/lib/bottling/",
  "src/lib/bulk/",
  "src/lib/cellar/",
  "src/lib/ferment/",
  "src/lib/harvest/",
  "src/lib/chemistry/",
  "src/lib/stock/",
  "src/lib/inventory/",
  "src/lib/sparkling/",
  "src/lib/vineyard/",
  "src/lib/winemaking-calc/",
  "src/lib/units/",
  "src/lib/reference/",
  "src/lib/settings/",
  "src/lib/locations/",
  "src/lib/fieldnotes/",
  "src/lib/developer/",
  "src/lib/feedback/",
];

export function normPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^"\s*|\s*"$/g, "");
}

export function isDenied(p: string): boolean {
  return deniedPrefixes.some((prefix) => p === prefix || p.startsWith(prefix));
}

export function isAllowed(p: string): boolean {
  return allowedPrefixes.some((prefix) => p.startsWith(prefix));
}

/** A path may be written iff it is in an allowed surface AND not in a denied one. */
export function fencePass(p: string): boolean {
  return !isDenied(p) && isAllowed(p);
}

// ---------------------------------------------------------------------------
// Domain-verify backstop (plan 052, Unit 3)
//
// Widening the fence into server domains means an LLM fix can become auto-merge-eligible for code
// that (e.g.) writes LotOperations into the append-only ledger. The required `check` CI job runs
// NO DB-hitting domain proof — only lint/tsc/vitest + the deterministic brain gates. So an
// auto-merge into a widened domain must ALSO pass that domain's runtime proof.
//
// Semantics of a touched `src/lib/<domain>/` dir:
//   • in the map with scripts  → run those `verify:*`; green ⇒ provable ⇒ auto-merge OK.
//   • in the map with []       → pure logic, fully covered by lint/tsc/vitest already ⇒ auto-merge OK.
//   • NOT in the map           → UNMAPPED: no runtime proof exists ⇒ auto-merge must route to a human.
// The original UI/assistant surfaces are exempt (they pre-date this and auto-merge on the default gate).
// ---------------------------------------------------------------------------

/** Widened server domains that carry a runtime proof (or are provable on the default gate via `[]`). */
export const domainVerifyMap: Record<string, string[]> = {
  "src/lib/work-orders/": ["verify:work-orders", "verify:work-orders-transform"],
  "src/lib/chemistry/": ["verify:chemistry"],
  // Pure logic — fully exercised by lint/tsc/vitest in the required `check` job; no extra DB proof.
  "src/lib/winemaking-calc/": [],
  "src/lib/units/": [],
  "src/lib/reference/": [],
};

/** Original surfaces that pre-date the domain-proof policy and never need one. */
const noDomainProofPrefixes = ["src/lib/assistant/"];

const LIB_PREFIX = "src/lib/";

export interface DomainVerifyResolution {
  /** Deduped `verify:*` npm scripts to run for the touched, mapped domains. */
  scripts: string[];
  /** Touched domains that have a proof entry (scripts to run, or `[]` = provable on the default gate). */
  provenDomains: string[];
  /** Touched `src/lib` domains with NO map entry — auto-merge must route to a human. */
  unmappedDomains: string[];
}

/**
 * Given a set of changed paths, resolve which domain proofs to run and whether any touched widened
 * domain lacks a proof. Only considers in-fence `src/lib` domains subject to the policy; UI/assistant
 * and out-of-fence paths are ignored here (the fence handles those).
 */
export function resolveDomainVerifies(paths: string[]): DomainVerifyResolution {
  const scripts = new Set<string>();
  const proven = new Set<string>();
  const unmapped = new Set<string>();
  for (const raw of paths) {
    const p = normPath(raw);
    if (!p) continue;
    if (!p.startsWith(LIB_PREFIX)) continue; // only src/lib domains are subject to the domain-proof policy
    if (!isAllowed(p) || isDenied(p)) continue; // out-of-fence is the fence's problem, not this one
    if (noDomainProofPrefixes.some((pre) => p.startsWith(pre))) continue; // exempt original surfaces
    const seg = p.slice(LIB_PREFIX.length).split("/")[0];
    if (!seg) continue;
    const domain = `${LIB_PREFIX}${seg}/`;
    if (Object.prototype.hasOwnProperty.call(domainVerifyMap, domain)) {
      proven.add(domain);
      for (const s of domainVerifyMap[domain]) scripts.add(s);
    } else {
      unmapped.add(domain);
    }
  }
  return {
    scripts: [...scripts],
    provenDomains: [...proven],
    unmappedDomains: [...unmapped],
  };
}
