// Phase 8b (Unit 14, D18) — the Phase-15 accounting export SEAM: PURE mapping, unit-tested directly. We
// do NOT call QuickBooks/Xero here; we emit immutable, idempotent, reversible export LINES that a Phase-15
// mapping layer posts as-is. Each COGS snapshot (or variance event) expands into one line PER capitalized
// component, each carrying a per-tenant (component, tax-class) → debit/credit account mapping and a
// deterministic postingKey so a re-emit is a no-op, not a duplicate. Incomplete-basis sources are WITHHELD
// (D14 — never post a number you can't stand behind). A reversal negates amounts and links back to the
// original, so the books can un-post cleanly.

import type { CostComponent } from "@prisma/client";
import type { Completeness } from "@/lib/cost/rollup";

const round8 = (n: number) => Math.round(n * 1e8) / 1e8;

/** account-map lookup keyed by `${component}|${taxClass ?? '*'}`; falls back to the `*` (any-tax) row. */
export type AccountMap = Map<string, { debit: string; credit: string }>;

export function accountKey(component: CostComponent, taxClass: string | null): string {
  return `${component}|${taxClass ?? "*"}`;
}

/** Resolve a component's debit/credit accounts: exact tax-class match first, then the `*` default. */
export function resolveAccounts(map: AccountMap, component: CostComponent, taxClass: string | null): { debit: string; credit: string } | null {
  return map.get(accountKey(component, taxClass)) ?? map.get(accountKey(component, null)) ?? null;
}

export type ExportSource = {
  /** the source's idempotency root (snapshot.postingKey, or a variance-derived key). */
  postingKey: string;
  componentBreakdown: Partial<Record<CostComponent, number>>;
  taxClass: string | null;
  currency: string;
  basisCompleteness: Completeness;
  /** true when the source is a reversal (negated amounts, linked back). */
  isReversal?: boolean;
};

export type ExportLine = {
  postingKey: string; // per-line idempotency key
  component: CostComponent;
  amount: number; // negated when the source is a reversal
  debitAccount: string | null;
  creditAccount: string | null;
  currency: string;
};

export type ExportBatch = {
  lines: ExportLine[];
  /** true only when the basis is KNOWN and every non-zero component maps to accounts — safe to post. */
  postable: boolean;
  reason?: string; // why it was withheld, when not postable
};

/**
 * Expand a source into per-component export lines. Withholds (postable=false) when the basis is not KNOWN
 * (D14) or when any non-zero component has no account mapping (an incomplete journal must never post). The
 * line set is still returned (unmapped accounts null) so a UI can show exactly what's missing.
 */
export function buildExportLines(src: ExportSource, map: AccountMap): ExportBatch {
  const sign = src.isReversal ? -1 : 1;
  const suffix = src.isReversal ? ":rev" : "";
  const lines: ExportLine[] = [];
  let unmapped = false;

  for (const [c, raw] of Object.entries(src.componentBreakdown)) {
    const amt = Number(raw);
    if (!Number.isFinite(amt) || Math.abs(amt) < 1e-8) continue;
    const component = c as CostComponent;
    const acct = resolveAccounts(map, component, src.taxClass);
    if (!acct) unmapped = true;
    lines.push({
      postingKey: `${src.postingKey}:${component}${suffix}`,
      component,
      amount: round8(amt * sign),
      debitAccount: acct?.debit ?? null,
      creditAccount: acct?.credit ?? null,
      currency: src.currency,
    });
  }

  if (src.basisCompleteness !== "KNOWN") {
    return { lines, postable: false, reason: `basis is ${src.basisCompleteness}` };
  }
  if (unmapped) {
    return { lines, postable: false, reason: "one or more components have no account mapping" };
  }
  return { lines, postable: true };
}

// ── Phase 15 Unit 7: post-bottling variance → export lines ──
// A CostVarianceEvent splits a basis correction into a SOLD delta (already-shipped bottles → a COGS
// adjustment) and an UNSOLD delta (on-hand bottles → an inventory-value adjustment). Both use the
// tenant's VARIANCE account mapping. We encode DIRECTION in the base debit/credit + a SIGNED amount,
// and the poster applies ONE uniform sign rule (amount ≥ 0 → debit/credit as given; amount < 0 → swap,
// abs the amount) so a negative delta becomes a correct mirror-image entry with a positive QBO amount:
//   sold   → base DR cost(=COGS)  / CR inventory   (a cost increase raises COGS)
//   unsold → base DR inventory    / CR cost         (a cost increase raises the on-hand asset value)
// NOTE (flag for the operator's accountant, like plan-026's CBMA placement): this is the v1
// interpretation of "sold→COGS-variance, unsold→inventory-value"; confirm before prod GA.

export type VarianceExportSource = {
  varianceEventId: string;
  soldDelta: number; // signed
  unsoldDelta: number; // signed
  currency: string;
  basisCompleteness: Completeness;
};

export function buildVarianceExportLines(src: VarianceExportSource, map: AccountMap): ExportBatch {
  const acct = resolveAccounts(map, "VARIANCE", null); // VARIANCE default ('*') mapping
  const lines: ExportLine[] = [];
  const push = (kind: "sold" | "unsold", amt: number, debit: string | null, credit: string | null) => {
    if (!Number.isFinite(amt) || Math.abs(amt) < 1e-8) return;
    lines.push({ postingKey: `var:${src.varianceEventId}:${kind}`, component: "VARIANCE", amount: round8(amt), debitAccount: debit, creditAccount: credit, currency: src.currency });
  };
  // sold → DR cost / CR inventory ; unsold → DR inventory / CR cost (direction; sign handled at post)
  push("sold", src.soldDelta, acct?.debit ?? null, acct?.credit ?? null);
  push("unsold", src.unsoldDelta, acct?.credit ?? null, acct?.debit ?? null);

  if (src.basisCompleteness !== "KNOWN") return { lines, postable: false, reason: `basis is ${src.basisCompleteness}` };
  if (!acct) return { lines, postable: false, reason: "the cost-variance account is not mapped" };
  return { lines, postable: true };
}
