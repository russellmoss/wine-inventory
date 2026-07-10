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
// SERVER domains. The money/tenancy/ledger/compliance/moat domains are deliberately absent
// (ledger, cost, money, accounting, commerce, compliance, transform) or hard-denied below
// (auth, dal, tenant, prisma) — plus src/lib/audit.ts, which is not under any allowed dir and so
// stays unwritable. Anything not listed here fails `isAllowed`, so the exclusions need no deny entry.
export const allowedPrefixes = [
  // UI + assistant + feedback API (original surfaces)
  "src/app/(app)/",
  "src/app/api/feedback/",
  "src/components/",
  "src/lib/assistant/",
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
