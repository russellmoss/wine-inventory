import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deriveTaxClass } from "@/lib/compliance/tax-class";
import { resolveTaxAbvForLots } from "@/lib/compliance/abv";
import { deriveBond } from "@/lib/compliance/bond";
import type { CombineLotState } from "@/lib/ledger/combine";

/**
 * Load the domain state decideCombineRoute needs, for a destination vessel's residents and the
 * lots arriving into it (plan 088, Unit 5).
 *
 * decideCombineRoute is pure and every field of CombineLotState is required, which is the point:
 * a core that forgets to load one is a type error rather than a silently permissive decision.
 * This is the one place that does the loading, so nine operations don't each grow their own
 * slightly-different version.
 *
 * Tax class is DERIVED here, not read: it depends on the as-of ABV (deriveTaxClass + the tax-ABV
 * resolver), which is exactly why absorbing across classes has to be refused rather than assumed.
 * `sparklingMethod` is null for vessel-resident wine — a sparkling lot lives in BOTTLE_STORAGE
 * (vesselId: null) and never appears in vessel occupancy.
 */
type DbClient = Prisma.TransactionClient;

export type LoadedCombineState = {
  destResidentLots: CombineLotState[];
  incoming: CombineLotState[];
};

export async function loadCombineState(
  opts: { toVesselId: string; incomingLotIds: string[]; asOf?: Date },
  client: DbClient = prisma as unknown as DbClient,
): Promise<LoadedCombineState> {
  const asOf = opts.asOf ?? new Date();

  const residents = await client.vesselLot.findMany({
    where: { vesselId: opts.toVesselId },
    select: { lotId: true },
  });
  const residentIds = residents.map((r) => r.lotId);
  const allIds = [...new Set([...residentIds, ...opts.incomingLotIds])];
  if (allIds.length === 0) return { destResidentLots: [], incoming: [] };

  const lots = await client.lot.findMany({
    where: { id: { in: allIds } },
    select: {
      id: true,
      code: true,
      form: true,
      afState: true,
      mlfState: true,
      productType: true,
      carbonation: true,
      ownership: true,
      taxAbvOverride: true,
    },
  });

  const abvByLot = await resolveTaxAbvForLots(allIds, asOf);
  const bondByLot = new Map<string, string | null>();
  for (const id of allIds) {
    // deriveBond throws when the tenant has no bonds configured; absent bonds means bond
    // isolation simply does not apply, so treat it as "no bond" rather than failing the write.
    bondByLot.set(id, await deriveBond(id, asOf, client).catch(() => null));
  }

  const stateById = new Map<string, CombineLotState>(
    lots.map((l) => [
      l.id,
      {
        lotId: l.id,
        lotCode: l.code,
        form: l.form,
        afState: l.afState,
        mlfState: l.mlfState,
        taxClass: deriveTaxClass({
          abv: abvByLot.get(l.id)?.abv ?? null,
          productType: l.productType,
          carbonation: l.carbonation,
          sparklingMethod: null, // vessel-resident wine is never en tirage (see the note above)
        }).taxClass,
        ownership: l.ownership,
        bondId: bondByLot.get(l.id) ?? null,
      },
    ]),
  );

  const pick = (ids: string[]) => ids.map((id) => stateById.get(id)).filter((s): s is CombineLotState => !!s);

  return {
    destResidentLots: pick(residentIds),
    incoming: pick(opts.incomingLotIds),
  };
}
