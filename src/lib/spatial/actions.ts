"use server";

// VI-P2 — spatial (NDVI) server actions used by the ASSISTANT (process_ndvi committer) and the thin data
// console. READY-USER gated via `action`. Enqueuing is fast: it drops a PENDING SpatialAnalysisJob and the
// cron sweep (job-sweep) does the slow STAC selection + fetch + materialization (ADR 0009, no worker).
// Importing job-sweep here also anchors the P2 cores (scene-selection / process-scene / block-metrics /
// usage) in the assistant import graph so verify:ai-native sees them reachable.
import { action } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { runNdviJobSweep, estateAoiBbox } from "@/lib/spatial/job-sweep";

export type EnqueueNdviInput = { vineyardId: string; aroundIso: string };

/** Enqueue a PENDING NDVI job for a vineyard "around a date". The sweep selects + processes it. Idempotent
 *  per (vineyard, day): a same-day re-request adopts the existing pending/complete job via the unique key. */
export const enqueueNdviJobAction = action(async (_ctx, input: EnqueueNdviInput) => {
  const aoiBbox = await estateAoiBbox(input.vineyardId);
  if (!aoiBbox) throw new Error("This vineyard has no confirmed planting-area geometry yet — draw the vineyard boundary first.");
  const day = input.aroundIso.slice(0, 10);
  const idempotencyKey = `ndvi:manual:${input.vineyardId}:${day}`;
  const existing = await prisma.spatialAnalysisJob.findFirst({ where: { idempotencyKey } });
  if (existing) return { jobId: existing.id, status: existing.status, deduped: true };
  const job = await prisma.spatialAnalysisJob.create({
    data: { vineyardId: input.vineyardId, idempotencyKey, params: { aoiBbox, requestedDateTarget: input.aroundIso, candidates: [] } as unknown as object },
  });
  return { jobId: job.id, status: job.status, deduped: false };
});

/** Drive the NDVI sweep for the CURRENT tenant now (the console's "run now"; the cron does this on schedule). */
export const runNdviSweepNowAction = action(async ({ actor }) => {
  const summary = await runNdviJobSweep({ orgIds: [actor.tenantId] });
  return { summary };
});

/** The jobs for a vineyard (console status list), newest first. */
export const listNdviJobsAction = action(async (_ctx, vineyardId: string) => {
  const jobs = await prisma.spatialAnalysisJob.findMany({
    where: { vineyardId },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, status: true, withheldReason: true, faultClass: true, createdAt: true, datasetId: true, sceneId: true },
  });
  return { jobs };
});

/** The latest NDVI metric per block for a vineyard (console proof the data landed). */
export const listVineyardNdviMetricsAction = action(async (_ctx, vineyardId: string) => {
  const rows = await prisma.blockSpatialMetric.findMany({
    where: { vineyardId, metric: "NDVI" },
    orderBy: [{ blockId: "asc" }, { acquiredAt: "desc" }],
    select: { blockId: true, mean: true, median: true, min: true, max: true, acquiredAt: true, validFraction: true, qualityFlags: true, geometryVersion: true, datasetId: true },
  });
  // Keep only the newest reading per block.
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.blockId)) latest.set(r.blockId, r);
  const blocks = await prisma.vineyardBlock.findMany({ where: { vineyardId }, select: { id: true, blockLabel: true } });
  const labelOf = new Map(blocks.map((b) => [b.id, b.blockLabel]));
  return {
    metrics: [...latest.values()].map((r) => ({
      block: labelOf.get(r.blockId) ?? r.blockId,
      ndviMean: r.mean === null ? null : Number(r.mean),
      ndviMedian: r.median === null ? null : Number(r.median),
      acquiredAt: r.acquiredAt,
      validPct: Math.round(Number(r.validFraction) * 100),
      flags: r.qualityFlags,
      geometryVersion: r.geometryVersion,
    })),
  };
});
