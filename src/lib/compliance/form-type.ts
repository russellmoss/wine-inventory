import type { ComplianceFormTypeValue } from "./types";

// plan-026 eng E1 / council C4 — the SINGLE place the two form-type discriminators live, plus a tiny
// where-fragment helper. Generalizing compliance_report for two forms means EVERY report query must
// scope by formType, or an excise return could become the 5120.17's carry-forward source (and corrupt
// the operations report), or vice-versa. Importing these constants + formScope() everywhere — instead
// of sprinkling "TTB_5120_17" string literals — makes a forgotten filter a compile error, not a silent
// cross-form leak. The regression is proven in verify-excise (a FILED excise row must NOT feed the
// 5120.17 carry-forward).

export const OPS_FORM: ComplianceFormTypeValue = "TTB_5120_17"; // Report of Wine Premises Operations (plan-025)
export const EXCISE_FORM: ComplianceFormTypeValue = "TTB_5000_24"; // Wine Excise Tax Return (plan-026)

/** Prisma where-fragment that scopes a compliance_report query to one form. Spread into `where`. */
export function formScope(formType: ComplianceFormTypeValue): { formType: ComplianceFormTypeValue } {
  return { formType };
}

// Phase 2 (BOND-1 / C6): the per-bond scope for the 5120.17. Every 5120.17 filing chain is scoped to
// ONE bond so carry-forward never crosses bonds; a null bondId means "not bond-scoped" (the 5000.24
// excise return stays bond-agnostic). Spread alongside formScope in every 5120.17 carry-forward /
// downstream-mark query. Extends COMPLIANCE-1's form scope, never weakens it.
export function bondScope(bondId: string | null | undefined): { bondId?: string } {
  return bondId ? { bondId } : {};
}
