import type { Prisma } from "@prisma/client";
import { OPS_FORM, formScope, bondScope } from "./form-type";
import type { LedgerLine } from "@/lib/ledger/math";
import type { ComplianceFormTypeValue } from "./types";

// NOTE: `resolveBondsForLots` is imported DYNAMICALLY (below), not statically. This module is pulled
// into writeLotOperation (the most-imported ledger module), and bond.ts's `DbClient`-union Prisma
// generics would otherwise tip TS over its type-instantiation-depth limit across every core that
// imports the chokepoint — the Phase-1 Surprise 1 blowup. The dynamic import severs that static edge
// (and only loads on the rare backdated-into-a-filed-period path, after the cheap pre-check).

// Phase 2 (AMEND-1) — amended-chain integrity. Appending an op at/inside an already-FILED 5120.17
// period silently desyncs that report AND every later report's carried-forward begin balance. This
// module marks the whole downstream (formType, bond) FILED chain `NEEDS_AMENDMENT`, synchronously and
// in the SAME transaction as the op (Key Decision a: no queue, no transient inconsistency). The
// begin-balance query already reads FILED OR NEEDS_AMENDMENT (generate.ts) so the chain keeps carrying
// its last-filed onHandEnd until its amended successor files — the carry-forward never breaks on a mark.
//
// AMEND-1 is 5120.17-ONLY (OPS_FORM): the 5000.24 excise return is stateless YTD (no carry-forward),
// and a physical return-to-bond is a current-period credit on the excise side, never a back-amendment
// (OQ-6). Excise is deliberately never touched here.
//
// Wired at the writeLotOperation chokepoint (the compliance domain's fold, alongside the barrel/bottle
// folds) so the broadened trigger (eng A1) covers EVERY backdated op — correction, transfer + its
// reversal, return-to-bond, removal, adjust — with one seam, not scattered per-core calls.

/**
 * Mark every FILED report in the (formType, bondId) chain whose period ends at/after `observedAt`
 * as NEEDS_AMENDMENT. updateMany hits ALL matching rows, so an older ORIGINAL lingering beside a newer
 * AMENDED (both FILED) are both marked (council Codex-CRIT1/SF). A no-op when nothing matches.
 */
export async function cascadeAmendmentMarks(
  tx: Prisma.TransactionClient,
  formType: ComplianceFormTypeValue,
  bondId: string,
  observedAt: Date,
): Promise<number> {
  const res = await tx.complianceReport.updateMany({
    where: { ...formScope(formType), ...bondScope(bondId), status: "FILED", periodEnd: { gte: observedAt } },
    data: { status: "NEEDS_AMENDMENT" },
  });
  return res.count;
}

/**
 * The chokepoint seam: if an op's `observedAt` lands at/inside an already-FILED 5120.17 period, mark
 * the affected (formType, bond) chains. The affected bonds are derived from the EMITTED lines — a
 * bond-moving op carries an explicit per-leg bond, so a cross-bond TRANSFER_IN_BOND (or its reversal)
 * marks BOTH the source and destination chains (council Codex-CRIT1 / Gemini-SF2); every other line
 * derives the lot's bond. Cheap in the common case: one findFirst that returns nothing for a
 * current-period op (observedAt after the latest filed period) → returns immediately.
 */
export async function cascadeAmendmentsForWrite(
  tx: Prisma.TransactionClient,
  input: { lines: LedgerLine[]; observedAt: Date },
): Promise<void> {
  const latest = await tx.complianceReport.findFirst({
    where: { ...formScope(OPS_FORM), status: { in: ["FILED", "NEEDS_AMENDMENT"] } },
    orderBy: { periodEnd: "desc" },
    select: { periodEnd: true },
  });
  // No filed 5120.17, or the op is after the latest filed period → nothing downstream is affected.
  if (!latest || input.observedAt > latest.periodEnd) return;

  const affectedBonds = new Set<string>();
  const lotsNeedingDerive: string[] = [];
  for (const l of input.lines) {
    if (l.sourceBondId) affectedBonds.add(l.sourceBondId);
    if (l.destBondId) affectedBonds.add(l.destBondId);
    if (!l.sourceBondId && !l.destBondId) lotsNeedingDerive.push(l.lotId);
  }
  if (lotsNeedingDerive.length > 0) {
    const { resolveBondsForLots } = await import("./bond");
    const byLot = await resolveBondsForLots(lotsNeedingDerive, input.observedAt, tx);
    for (const b of byLot.values()) affectedBonds.add(b);
  }
  for (const bondId of affectedBonds) {
    await cascadeAmendmentMarks(tx, OPS_FORM, bondId, input.observedAt);
  }
}
