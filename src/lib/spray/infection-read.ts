// Spray Intelligence S5a — the read seam for the latent-infection ledger. Mirrors
// phenology/read.ts: one Promise.all for the fixed lookups, Decimal/Date coercion AT THE PRISMA
// BOUNDARY (never inside a core), and `today` resolved through site-time-core and injected.

import "server-only";
import { prisma } from "@/lib/prisma";
import { getWineryTimeZone } from "@/lib/settings/data";
import { resolveSiteTimeZone, siteTodayIso } from "@/lib/weather/site-time-core";
import { composeInfectionStatusCore, type InfectionEventRow, type InfectionStatusDTO } from "./infection-read-core";

export interface InfectionReadOptions {
  /** Site-local today override, for tests and verify scripts. */
  today?: string;
  /** Assistant only — never read inside a cached fn (K12), so it is passed explicitly. */
  viewerTimeZone?: string | null;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Current latent-infection state for one vineyard.
 *
 * "Current" is the LATEST ROW PER logicalEventId (council C4) — never a lookup by
 * pathogen/organ, because a block can carry several episodes of the same pathogen in one season.
 * The ledger is append-only, so the newest `seq` in each stream is the truth.
 */
export async function loadVineyardInfectionStatus(
  vineyardId: string,
  opts: InfectionReadOptions = {},
): Promise<InfectionStatusDTO> {
  const [blocks, configRow, wineryTz] = await Promise.all([
    prisma.vineyardBlock.findMany({ where: { vineyardId }, select: { id: true, blockLabel: true } }),
    prisma.vineyardWeatherConfig.findFirst({ where: { vineyardId }, select: { timeZone: true } }),
    getWineryTimeZone().catch(() => null),
  ]);

  const timeZone = resolveSiteTimeZone(configRow?.timeZone, wineryTz, opts.viewerTimeZone ?? null);
  const today = opts.today ?? siteTodayIso(timeZone);

  if (blocks.length === 0) {
    return composeInfectionStatusCore({
      vineyardId,
      today,
      rows: [],
      notes: ["This vineyard has no blocks recorded, so there is nothing to track infections against."],
    });
  }

  const blockIds = blocks.map((b) => b.id);
  const labelById = new Map(blocks.map((b) => [b.id, b.blockLabel]));

  // Every append for these blocks, newest first. Reducing in memory (rather than a correlated
  // subquery per stream) keeps this on the composite (tenantId, logicalEventId, seq DESC) index and
  // avoids the "latest row per stream" shape Prisma is poor at.
  const appends = await prisma.latentInfectionEvent.findMany({
    where: { blockId: { in: blockIds } },
    orderBy: [{ logicalEventId: "asc" }, { seq: "desc" }],
    select: {
      logicalEventId: true,
      seq: true,
      blockId: true,
      pathogen: true,
      hostOrgan: true,
      status: true,
      resolutionKind: true,
      infectionOccurredOn: true,
      symptomExpectedAt: true,
      symptomProjectionKind: true,
      infectiousExpectedAt: true,
      infectiousProjectionKind: true,
      expiresOn: true,
      evidenceSource: true,
    },
  });

  const latestByStream = new Map<string, (typeof appends)[number]>();
  for (const a of appends) if (!latestByStream.has(a.logicalEventId)) latestByStream.set(a.logicalEventId, a);

  const rows: InfectionEventRow[] = [...latestByStream.values()].map((a) => ({
    logicalEventId: a.logicalEventId,
    blockId: a.blockId,
    blockLabel: labelById.get(a.blockId) ?? null,
    pathogen: a.pathogen,
    hostOrgan: a.hostOrgan,
    status: a.status,
    resolutionKind: a.resolutionKind,
    infectionOccurredOn: a.infectionOccurredOn.toISOString().slice(0, 10),
    symptomExpectedAt: iso(a.symptomExpectedAt),
    symptomProjectionKind: a.symptomProjectionKind,
    infectiousExpectedAt: iso(a.infectiousExpectedAt),
    infectiousProjectionKind: a.infectiousProjectionKind,
    expiresOn: iso(a.expiresOn),
    evidenceSource: a.evidenceSource,
  }));

  return composeInfectionStatusCore({ vineyardId, today, rows });
}
