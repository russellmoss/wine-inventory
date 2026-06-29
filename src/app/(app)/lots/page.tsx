import { requireReadyUser } from "@/lib/dal";
import { listLots, type LotListFilter } from "@/lib/lot/data";
import { LotsClient } from "./LotsClient";

// Read-only Lot list (Phase 2). Status filter via ?status= (default ACTIVE = current
// cellar). Optional ?vessel= filter (NICE). All reads go through the ledger/projection
// loader — never vessel_component. params/searchParams are Promises in this Next build.

const FILTERS: LotListFilter[] = ["ACTIVE", "DEPLETED", "ARCHIVED", "ALL"];

function parseStatus(raw?: string): LotListFilter {
  const up = (raw ?? "").toUpperCase();
  return (FILTERS as string[]).includes(up) ? (up as LotListFilter) : "ACTIVE";
}

export default async function LotsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; vessel?: string; lens?: string }>;
}) {
  const user = await requireReadyUser();
  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const vesselId = sp.vessel?.trim() || undefined;

  // "My fruit downstream" lens (Unit 10): an opt-in VIEW for a manager — filter to lots whose
  // source set intersects their vineyards. The cellar stays tenant-wide; with the lens off the
  // manager sees every lot (no scoping). Admins never need it.
  const canLens = user.role !== "admin" && user.vineyardIds.length > 0;
  const lensOn = canLens && sp.lens === "mine";
  const lots = await listLots({
    status,
    vesselId,
    ...(lensOn ? { sourceVineyardIn: user.vineyardIds } : {}),
  });
  return <LotsClient lots={lots} status={status} vesselId={vesselId} canLens={canLens} lensOn={lensOn} />;
}
