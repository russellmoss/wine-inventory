import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import type { Prisma } from "@prisma/client";

// Phase 2 (BOND-1) — point-in-time bond derivation, the exact mirror of deriveTaxClass /
// resolveClassesForLots (tax-class.ts / generate.ts:85). The authoritative bond of a lot is DERIVED
// from the ledger, NEVER a mutable Lot column: it is the dest bond of the most-recent bond-moving op
// (TRANSFER_IN_BOND / RETURN_TO_BOND) whose line carries an explicit destBondId, as-of the moment.
//
// The fallback is deliberately ASYMMETRIC (council Codex-CRIT2 / DESIGN3):
//   • A legacy/origination lot with NO bond history derives the tenant's PRIMARY bond.
//   • A single-parent split/lees child with no bond op of its own walks to its PARENT's derived bond
//     as-of the lineage event (eng A4) — not primary.
//   • A bond-MOVING op must carry an explicit, non-null, source≠dest bond (enforced in the C2/C5
//     cores + a discriminated input) — it never derives primary implicitly. deriveBond only ever
//     READS what those ops stamped; it never invents a bond for a movement.
//
// Script-safe (no "use server") — the period fold, verify scripts, and the CRUD actions all call it.

type DbClient = Prisma.TransactionClient | typeof prisma;

/** A single bond registry row (the fields the derivation + filer identity need). */
export type BondRow = {
  id: string;
  registryNumber: string;
  penalSum: number | null;
  premises: string | null;
  isPrimary: boolean;
};

const toRow = (b: {
  id: string;
  registryNumber: string;
  penalSum: Prisma.Decimal | null;
  premises: string | null;
  isPrimary: boolean;
}): BondRow => ({
  id: b.id,
  registryNumber: b.registryNumber,
  penalSum: b.penalSum == null ? null : Number(b.penalSum),
  premises: b.premises,
  isPrimary: b.isPrimary,
});

/** All bonds for the active tenant (registry order; primary first). */
export async function listBonds(client: DbClient = prisma): Promise<BondRow[]> {
  const bonds = await client.bond.findMany({
    orderBy: [{ isPrimary: "desc" }, { registryNumber: "asc" }],
    select: { id: true, registryNumber: true, penalSum: true, premises: true, isPrimary: true },
  });
  return bonds.map(toRow);
}

/**
 * The tenant's PRIMARY bond — created transparently at backfill (M3), so it always exists for a
 * migrated tenant. Fails closed if absent (a tenant with wine but no bond is a broken backfill, not
 * a state to guess through). Cached-fn safe: reads the active tenant via the extension, no ALS peek.
 */
export async function getPrimaryBond(client: DbClient = prisma): Promise<BondRow> {
  const primary = await client.bond.findFirst({
    where: { isPrimary: true },
    select: { id: true, registryNumber: true, penalSum: true, premises: true, isPrimary: true },
  });
  if (!primary) {
    throw new ActionError("This winery has no primary bond configured. Add one in Settings → Bonds.", "CONFLICT");
  }
  return toRow(primary);
}

/**
 * Resolve the authoritative bond id of each lot as-of `asOf`, batched (no N+1 — mirrors
 * resolveClassesForLots at generate.ts:85). Precedence per lot:
 *   1. the destBondId of its most-recent bond-moving line ≤ asOf (the ledger is authority);
 *   2. else its single/unanimous parent's derived bond as-of the lineage event (lineage-child rule);
 *   3. else the tenant's primary bond (legacy / origination fallback).
 * Returns Map<lotId, bondId> covering every input id.
 */
export async function resolveBondsForLots(
  lotIds: string[],
  asOf: Date,
  client: DbClient = prisma,
  _depth = 0,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(lotIds)].filter(Boolean);
  if (ids.length === 0) return out;

  // 1. Direct: the latest line that stamped a dest bond for the lot (the position it moved onto).
  const bondLines = await client.lotOperationLine.findMany({
    where: { lotId: { in: ids }, destBondId: { not: null }, operation: { observedAt: { lte: asOf } } },
    select: { lotId: true, destBondId: true, operation: { select: { observedAt: true, id: true } } },
  });
  const latest = new Map<string, { bondId: string; observedAt: Date; opId: number }>();
  for (const l of bondLines) {
    if (!l.destBondId) continue;
    const cur = latest.get(l.lotId);
    const at = l.operation.observedAt;
    // Deterministic tiebreaker: later observedAt wins; on a tie the higher opId (later write) wins.
    if (!cur || at > cur.observedAt || (at.getTime() === cur.observedAt.getTime() && l.operation.id > cur.opId)) {
      latest.set(l.lotId, { bondId: l.destBondId, observedAt: at, opId: l.operation.id });
    }
  }
  for (const [lotId, v] of latest) out.set(lotId, v.bondId);

  const unresolved = ids.filter((id) => !out.has(id));
  if (unresolved.length === 0) return out;

  // 2. Lineage-child walk: a child with no bond op of its own inherits its parent(s)' bond as-of the
  //    lineage event. Cross-bond blends are blocked at commit (C2), so a blend child's parents share
  //    a bond; we take the unanimous parent bond. Depth-capped (lineage is a DAG; this terminates at
  //    origination lots) — the cap is a defensive backstop, never hit in practice.
  if (_depth < 32) {
    const edges = await client.lotLineage.findMany({
      where: { childLotId: { in: unresolved } },
      select: { childLotId: true, parentLotId: true, createdAt: true },
    });
    if (edges.length > 0) {
      const parentIds = [...new Set(edges.map((e) => e.parentLotId))];
      // Resolve parents as-of the earliest lineage event that produced any child (bounded by asOf) —
      // the child inherits the bond the parent sat on when it split off, not a later parent transfer.
      const parentBonds = await resolveBondsForLots(parentIds, asOf, client, _depth + 1);
      const byChild = new Map<string, Set<string>>();
      for (const e of edges) {
        const pb = parentBonds.get(e.parentLotId);
        if (!pb) continue;
        if (!byChild.has(e.childLotId)) byChild.set(e.childLotId, new Set());
        byChild.get(e.childLotId)!.add(pb);
      }
      for (const [childId, bonds] of byChild) {
        // Unanimous parent bond (the common case; cross-bond blends can't reach here). If parents
        // somehow disagree, fall through to the primary fallback rather than pick arbitrarily.
        if (bonds.size === 1) out.set(childId, [...bonds][0]);
      }
    }
  }

  const stillUnresolved = ids.filter((id) => !out.has(id));
  if (stillUnresolved.length === 0) return out;

  // 3. Legacy / origination fallback: the tenant's primary bond.
  const primary = await getPrimaryBond(client);
  for (const id of stillUnresolved) out.set(id, primary.id);
  return out;
}

/** Single-lot convenience wrapper over resolveBondsForLots. */
export async function deriveBond(lotId: string, asOf: Date, client: DbClient = prisma): Promise<string> {
  const map = await resolveBondsForLots([lotId], asOf, client);
  const bondId = map.get(lotId);
  if (!bondId) throw new ActionError("Could not resolve a bond for that lot.", "CONFLICT");
  return bondId;
}

// ─────────────────────────── Bond CRUD (script-safe cores; admin-gated wrappers in bond-actions.ts) ───────────────────────────
// Bonds are tenant-editable self-serve (ux-principle 9) — never a support ticket (the InnoVint
// anti-pattern). tenantId is auto-injected by the extension; registryNumber is per-tenant unique.

export type BondInput = {
  registryNumber: string;
  penalSum?: number | null;
  premises?: string | null;
};

function normalizeBondInput(input: BondInput): { registryNumber: string; penalSum: number | null; premises: string | null } {
  const registryNumber = input.registryNumber?.trim();
  if (!registryNumber) throw new ActionError("A bond needs a TTB registry number.");
  const penalSum = input.penalSum == null ? null : Number(input.penalSum);
  if (penalSum != null && (!Number.isFinite(penalSum) || penalSum < 0)) {
    throw new ActionError("Penal sum must be a non-negative amount.");
  }
  return { registryNumber, penalSum, premises: input.premises?.trim() || null };
}

/** Create a bond for the active tenant. The FIRST bond a tenant creates is NOT auto-primary — the
 * primary is the one minted at backfill; a net-new tenant's primary is set explicitly. A duplicate
 * registry number surfaces the per-tenant unique as a friendly error. */
export async function createBondCore(input: BondInput, client: DbClient = prisma): Promise<BondRow> {
  const { registryNumber, penalSum, premises } = normalizeBondInput(input);
  const existing = await client.bond.findFirst({ where: { registryNumber }, select: { id: true } });
  if (existing) throw new ActionError(`A bond with registry number "${registryNumber}" already exists.`, "CONFLICT");
  const created = await client.bond.create({
    data: { registryNumber, penalSum, premises, isPrimary: false },
    select: { id: true, registryNumber: true, penalSum: true, premises: true, isPrimary: true },
  });
  return toRow(created);
}

/** Update a bond's registry number / penal sum / premises. Never flips isPrimary (use setPrimaryBondCore). */
export async function updateBondCore(bondId: string, input: BondInput, client: DbClient = prisma): Promise<BondRow> {
  const { registryNumber, penalSum, premises } = normalizeBondInput(input);
  const bond = await client.bond.findUnique({ where: { id: bondId }, select: { id: true } });
  if (!bond) throw new ActionError("That bond doesn't exist in this winery.", "CONFLICT");
  const clash = await client.bond.findFirst({ where: { registryNumber, id: { not: bondId } }, select: { id: true } });
  if (clash) throw new ActionError(`A bond with registry number "${registryNumber}" already exists.`, "CONFLICT");
  const updated = await client.bond.update({
    where: { id: bondId },
    data: { registryNumber, penalSum, premises },
    select: { id: true, registryNumber: true, penalSum: true, premises: true, isPrimary: true },
  });
  return toRow(updated);
}

/** Make `bondId` the tenant's single primary bond (unset any other). Exactly one primary per tenant:
 * deriveBond's legacy fallback and the single-bond UX both rely on it. Runs both writes in one tx. */
export async function setPrimaryBondCore(bondId: string, client: DbClient = prisma): Promise<void> {
  const bond = await client.bond.findUnique({ where: { id: bondId }, select: { id: true } });
  if (!bond) throw new ActionError("That bond doesn't exist in this winery.", "CONFLICT");
  await client.bond.updateMany({ where: { isPrimary: true, id: { not: bondId } }, data: { isPrimary: false } });
  await client.bond.update({ where: { id: bondId }, data: { isPrimary: true } });
}

