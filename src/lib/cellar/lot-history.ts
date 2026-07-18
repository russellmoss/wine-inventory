// Plan 072 Unit 10 (read side): pure, client-safe helpers for the per-lot history panel — no prisma, no
// React, so both the client component and the unit tests import them directly. `now` is injected (never
// Date.now() inside) so the expiry classification is deterministic and testable.

export type LotExpiryStatus = "expired" | "soon" | "ok";

/**
 * Classify a lot's expiry relative to `now`. Returns null when there's no (valid) expiry — most supply lots
 * carry none. `soonDays` (default 30) is the near-expiry warning window. daysUntil is negative once expired.
 */
export function lotExpiryStatus(
  expiresAt: string | Date | null | undefined,
  now: Date,
  soonDays = 30,
): { status: LotExpiryStatus; daysUntil: number } | null {
  if (!expiresAt) return null;
  const exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return null;
  const daysUntil = Math.ceil((exp.getTime() - now.getTime()) / 86_400_000);
  const status: LotExpiryStatus = daysUntil < 0 ? "expired" : daysUntil <= soonDays ? "soon" : "ok";
  return { status, daysUntil };
}

/** Short human label for an expiry status (null → no expiry recorded). */
export function expiryLabel(s: { status: LotExpiryStatus; daysUntil: number } | null): string {
  if (!s) return "";
  if (s.status === "expired") return `Expired ${Math.abs(s.daysUntil)}d ago`;
  if (s.status === "soon") return s.daysUntil === 0 ? "Expires today" : `Expires in ${s.daysUntil}d`;
  return `Expires in ${s.daysUntil}d`;
}

/** Display label for a LotDocument role (INVOICE|COA → readable). Unknown roles pass through title-cased. */
export function docRoleLabel(role: string): string {
  const r = role.trim().toUpperCase();
  if (r === "INVOICE") return "Invoice";
  if (r === "COA") return "COA";
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}
