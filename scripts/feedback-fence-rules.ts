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

// Writable surfaces — app UI + components + the assistant + the feedback API. Server domain
// logic under src/lib/** (ledger, cost, compliance, …) is intentionally NOT here.
export const allowedPrefixes = [
  "src/app/(app)/",
  "src/app/api/feedback/",
  "src/components/",
  "src/lib/assistant/",
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
