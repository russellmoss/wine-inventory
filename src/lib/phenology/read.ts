// Spray Intelligence S4 — the server read seam.
//
// Loads a block's phenology anchors (from field notes), the vineyard's daily weather, and the
// durable canopy profile, then hands them to the pure cores. S5b, S6, and S7b read what this
// returns; the assistant reads it through query_field_reports.
//
// Timezone: resolved via resolveSiteTimeZone / siteTodayIso, never
// `new Date().toISOString().slice(0,10)` — a UTC "today" puts a vineyard's season boundary a day
// off near midnight, which is the bug plan 096 Phase 0 already fixed once for the weather tree.

import "server-only";
import { prisma } from "@/lib/prisma";
import { getRecentFieldNotes } from "@/lib/fieldnotes/actions";
import { getWineryTimeZone } from "@/lib/settings/data";
import { resolveVineyardCentroid } from "@/lib/weather/location";
import { resolveSiteTimeZone, siteTodayIso } from "@/lib/weather/site-time-core";
import type { LocalDailyRecord } from "@/lib/weather/obs-time-core";
import { estimatePhenologyStageCore, type PhenologyAnchor } from "@/lib/phenology/stage-core";
import { estimateGrowthCore, type GrowthObservation } from "@/lib/phenology/growth-core";
import { composePhenologyBlockCore, type PhenologyBlockDTO } from "@/lib/phenology/dto";
import type { ClusterCompactnessValue, TrellisSystemValue } from "@/lib/phenology/canopy-profile";

/** How many weekly reports to scan for anchors. A season of weekly notes is ~30. */
const ANCHOR_WINDOW_REPORTS = 40;

const dec = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export type PhenologyReadOptions = {
  /** The civil day the question is about. Defaults to site-local today. */
  targetDate?: string;
  /**
   * The date protection was laid down — normally a spray date. Growth is measured FROM here.
   * Defaults to 7 days before the target, which answers "what has grown since last week".
   */
  sinceDate?: string;
  /** Viewer timezone, threaded through from the assistant. Never read inside a cached fn (K12). */
  viewerTimeZone?: string | null;
};

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Phenology + growth for every block of a vineyard.
 *
 * Returns one DTO per block, each carrying its own provenance. A block with no bud-break
 * observation comes back with `stage: null` and a reason — that is the designed behaviour, not a
 * failure, and callers must render it as its own state rather than as a degraded answer.
 */
export async function loadVineyardPhenology(
  vineyardId: string,
  opts: PhenologyReadOptions = {},
): Promise<PhenologyBlockDTO[]> {
  const [blocks, notes, centroid, configRow, wineryTz] = await Promise.all([
    prisma.vineyardBlock.findMany({
      where: { vineyardId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        blockLabel: true,
        trellisSystem: true,
        clusterCompactness: true,
        variety: { select: { clusterCompactness: true } },
      },
    }),
    getRecentFieldNotes(vineyardId, ANCHOR_WINDOW_REPORTS),
    resolveVineyardCentroid(vineyardId),
    prisma.vineyardWeatherConfig.findFirst({
      where: { vineyardId },
      select: { timeZone: true, primaryProviderKey: true, primaryProviderOverride: true },
    }),
    getWineryTimeZone().catch(() => null),
  ]);
  if (blocks.length === 0) return [];

  const timeZone = resolveSiteTimeZone(configRow?.timeZone, wineryTz, opts.viewerTimeZone ?? null);
  const targetDate = opts.targetDate ?? siteTodayIso(timeZone);
  const sinceDate = opts.sinceDate ?? addDays(targetDate, -7);

  // One source per day — the effective primary, exactly as the climate summary resolves it. A
  // GDD curve must never be blended across providers (weather council R3).
  const primary = configRow?.primaryProviderOverride ?? configRow?.primaryProviderKey ?? null;
  const rows = await prisma.vineyardClimateDaily.findMany({
    where: { vineyardId, ...(primary ? { providerKey: primary } : {}) },
    select: { localDate: true, tmaxC: true, tminC: true, precipMm: true, rhMaxPct: true, rhMinPct: true },
    orderBy: { localDate: "asc" },
  });
  const dailyRecords: LocalDailyRecord[] = rows.map((r) => ({
    localDate: r.localDate.toISOString().slice(0, 10),
    tmaxC: dec(r.tmaxC),
    tminC: dec(r.tminC),
    precipMm: dec(r.precipMm),
    rhMaxPct: dec(r.rhMaxPct),
    rhMinPct: dec(r.rhMinPct),
  }));

  // Oldest-first, so anchors and growth observations read chronologically.
  const chronological = [...notes].sort((a, b) => (a.weekOf < b.weekOf ? -1 : a.weekOf > b.weekOf ? 1 : 0));

  return blocks.map((block) => {
    const anchors: PhenologyAnchor[] = [];
    const observations: GrowthObservation[] = [];
    let latestCanopy: {
      fruitZoneLeafRemoval: PhenologyBlockDTO["fruitZoneLeafRemoval"];
      hedgedThisWeek: boolean | null;
      clusterDamage: PhenologyBlockDTO["clusterDamage"];
      vinegarFlyPressure: PhenologyBlockDTO["vinegarFlyPressure"];
    } = { fruitZoneLeafRemoval: null, hedgedThisWeek: null, clusterDamage: null, vinegarFlyPressure: null };

    for (const note of chronological) {
      const s = note.blockLevelStatuses[block.id];
      if (!s) continue;
      if (s.phenoStage !== null) {
        anchors.push({ date: note.weekOf, stage: s.phenoStage, stagePct: s.phenoStagePct });
      }
      observations.push({
        date: note.weekOf,
        shootLengthCm: s.shootLengthCm,
        shootLengthBand: s.shootLengthBand,
        shootTip: s.shootTip,
        hedgedThisWeek: s.hedgedThisWeek,
      });
      // The most recent report AT OR BEFORE the target owns the canopy/scouting readout. A later
      // report must not leak backwards into an answer about an earlier date.
      if (note.weekOf <= targetDate) {
        latestCanopy = {
          fruitZoneLeafRemoval: s.fruitZoneLeafRemoval,
          hedgedThisWeek: s.hedgedThisWeek,
          clusterDamage: s.clusterDamage,
          vinegarFlyPressure: s.vinegarFlyPressure,
        };
      }
    }

    const stage = estimatePhenologyStageCore({
      anchors,
      dailyRecords,
      latitude: centroid?.lat ?? 0,
      targetDate,
      today: siteTodayIso(timeZone),
    });
    const growth = estimateGrowthCore({ observations, sinceDate, targetDate });

    return composePhenologyBlockCore({
      blockId: block.id,
      blockLabel: block.blockLabel ?? "(unlabeled)",
      stage,
      growth,
      trellisSystem: (block.trellisSystem as TrellisSystemValue | null) ?? null,
      blockCompactness: (block.clusterCompactness as ClusterCompactnessValue | null) ?? null,
      varietyCompactness: (block.variety?.clusterCompactness as ClusterCompactnessValue | null) ?? null,
      ...latestCanopy,
    });
  });
}
