import "server-only";

/**
 * Vineyard Intelligence P2 — the NDVI job sweep (Unit 6). Cron-driven, claim-first, no worker (ADR 0009).
 *
 * Mirrors accounting/post-sweep.ts: atomically CLAIM a bounded batch of PENDING/expired jobs (FOR UPDATE
 * SKIP LOCKED → IN_FLIGHT + a lease), then OUTSIDE the claim tx do the slow work — select the scene (STAC,
 * if the job carries no candidates yet) and process it (processSceneJobCore, which is itself C1-idempotent)
 * — and finalize each job by its outcome. The lease is > 300 s + slack (CDSE took 135 s live; no heartbeat
 * infra) so a healthy long fetch is never double-claimed. A quota-exhausted WITHHELD job is NOT reclaimed
 * until the next billing window (S5). DARK auto-add (rule §2.8) enqueues the best new clear scene ONLY for
 * vineyards with ndviAutoAdd=true and quota headroom.
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantRawTx } from "@/lib/tenant/tx";
import { listAllOrgIds, disconnectEnumerator } from "@/lib/accounting/enumerator";
import { searchScenesCore, topContainingCandidates, type SearchStacFn } from "@/lib/gis/satellite/scene-selection-core";
import { searchStacScenes } from "@/lib/gis/satellite/client";
import { processSceneJobCore, type SceneJobParams, type ProcessSceneDeps } from "@/lib/gis/satellite/process-scene-core";
import { readCdseUsage, isCdseQuotaExhausted } from "@/lib/spatial/usage-core";
import { unionPolygons } from "@/lib/gis/boolean";
import { bbox as geomBbox, type VineyardPolygon } from "@/lib/gis/geometry";

const BATCH = Number(process.env.NDVI_SWEEP_BATCH_PER_TENANT) || 5;
/** Lease minutes: > the 5-min Vercel maxDuration + slack, so a long CDSE fetch (135 s live) isn't reclaimed. */
const LEASE_MIN = 10;

export type NdviSweepSummary = { orgs: number; claimed: number; completed: number; withheld: number; failed: number; autoAddEnqueued: number };

export type NdviSweepDeps = { orgIds?: string[]; searchStac?: SearchStacFn; process?: ProcessSceneDeps; now?: () => Date };

/** Atomically claim a bounded batch of workable jobs → IN_FLIGHT + fresh lease. Quota-withheld jobs are NOT
 *  reclaimed until the next billing window (S5): a WITHHELD row with faultClass 'quota' stays put. */
async function claimBatch(): Promise<string[]> {
  const rows = await runInTenantRawTx((tx, tenantId) =>
    tx.$queryRaw<{ id: string }[]>`
      UPDATE "spatial_analysis_job"
      SET status = 'IN_FLIGHT', "claimedAt" = now(), "leaseExpiresAt" = now() + make_interval(mins => ${LEASE_MIN}::int),
          "attemptCount" = "attemptCount" + 1, "updatedAt" = now()
      WHERE id IN (
        SELECT id FROM "spatial_analysis_job"
        WHERE "tenantId" = ${tenantId}
          AND ( status = 'PENDING' OR (status = 'IN_FLIGHT' AND "leaseExpiresAt" < now()) )
        ORDER BY "createdAt" ASC
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`,
  );
  return rows.map((r) => r.id);
}

/** The estate AOI bbox = WGS84 bbox of the union of the vineyard's planting areas (null if unmigrated). */
export async function estateAoiBbox(vineyardId: string): Promise<[number, number, number, number] | null> {
  const areas = await prisma.vineyardPlantingArea.findMany({ where: { vineyardId }, select: { geometry: true } });
  if (areas.length === 0) return null;
  const polys = areas.map((a) => a.geometry as unknown as VineyardPolygon);
  const union = polys.length === 1 ? polys[0] : unionPolygons(polys);
  return geomBbox(union);
}

/** Populate a job's params.candidates by searching STAC around its target date (idempotent — re-runs are safe). */
async function ensureCandidates(jobId: string, vineyardId: string, params: SceneJobParams, searchStac: SearchStacFn): Promise<SceneJobParams | null> {
  if (params.candidates.length > 0) return params;
  const aoiBbox = (await estateAoiBbox(vineyardId)) ?? params.aoiBbox;
  const result = await searchScenesCore({ searchStac, aoiBbox, aroundIso: params.requestedDateTarget });
  const top = topContainingCandidates(result, 3);
  if (top.length === 0) return null; // no containing scene in any window → the caller marks no-candidates
  const next: SceneJobParams = { aoiBbox, requestedDateTarget: params.requestedDateTarget, candidates: top.map((c) => ({ providerSceneId: c.providerSceneId, acquiredAt: c.acquiredAt, cloudCover: c.cloudCover, processingVersion: c.processingVersion, bbox: c.bbox })) };
  await prisma.spatialAnalysisJob.update({ where: { id: jobId }, data: { params: next as unknown as object } });
  return next;
}

async function finalizeJob(jobId: string, outcome: Awaited<ReturnType<typeof processSceneJobCore>>): Promise<void> {
  if (outcome.status === "COMPLETED") return; // the core already set COMPLETED + datasetId/sceneId in its tx
  const data =
    outcome.status === "WITHHELD"
      ? { status: "WITHHELD" as const, withheldReason: outcome.withheldReason, faultClass: outcome.faultClass ?? null, leaseExpiresAt: null }
      : outcome.status === "FAILED"
        ? { status: "FAILED" as const, faultClass: outcome.faultClass, lastError: outcome.error, leaseExpiresAt: null }
        : { status: "PENDING" as const, leaseExpiresAt: null }; // BACKOFF → let it re-drive
  await prisma.spatialAnalysisJob.update({ where: { id: jobId }, data });
}

/** Process one tenant's claimed jobs. Returns per-tenant tallies. */
async function sweepTenant(deps: NdviSweepDeps): Promise<Omit<NdviSweepSummary, "orgs">> {
  const searchStac = deps.searchStac ?? searchStacScenes;
  const ids = await claimBatch();
  let completed = 0, withheld = 0, failed = 0;
  for (const id of ids) {
    const job = await prisma.spatialAnalysisJob.findUnique({ where: { id } });
    if (!job) continue;
    let params: SceneJobParams;
    try {
      params = job.params as unknown as SceneJobParams;
      const populated = await ensureCandidates(job.id, job.vineyardId, params, searchStac);
      if (!populated) {
        await prisma.spatialAnalysisJob.update({ where: { id: job.id }, data: { status: "WITHHELD", withheldReason: "no-candidates", leaseExpiresAt: null } });
        withheld++;
        continue;
      }
      const outcome = await processSceneJobCore({ id: job.id, vineyardId: job.vineyardId, params: populated }, deps.process);
      await finalizeJob(job.id, outcome);
      if (outcome.status === "COMPLETED") completed++;
      else if (outcome.status === "WITHHELD") withheld++;
      else if (outcome.status === "FAILED") failed++;
    } catch (e) {
      // transient/retryable (thrown by the core) → release the lease so the next sweep retries.
      await prisma.spatialAnalysisJob.update({ where: { id: job.id }, data: { status: "PENDING", leaseExpiresAt: null, lastError: e instanceof Error ? e.message : "sweep error" } }).catch(() => {});
    }
  }
  const autoAddEnqueued = await runAutoAdd(deps);
  return { claimed: ids.length, completed, withheld, failed, autoAddEnqueued };
}

/** DARK auto-add (rule §2.8): for vineyards with ndviAutoAdd=true and quota headroom, enqueue ONE PENDING job
 *  for "around today" if none is already pending. Ships OFF by default; the sweep does the search next tick. */
async function runAutoAdd(deps: NdviSweepDeps): Promise<number> {
  const usage = await readCdseUsage(deps.now?.());
  if (isCdseQuotaExhausted(usage)) return 0; // no headroom → never scale provider calls with tenant count
  const vineyards = await prisma.vineyard.findMany({ where: { ndviAutoAdd: true }, select: { id: true } });
  let enqueued = 0;
  for (const v of vineyards) {
    const pending = await prisma.spatialAnalysisJob.count({ where: { vineyardId: v.id, status: { in: ["PENDING", "IN_FLIGHT"] } } });
    if (pending > 0) continue;
    const aoiBbox = await estateAoiBbox(v.id);
    if (!aoiBbox) continue;
    const today = (deps.now?.() ?? new Date()).toISOString();
    await prisma.spatialAnalysisJob.create({
      data: { vineyardId: v.id, idempotencyKey: `ndvi:auto:${v.id}:${today.slice(0, 10)}`, params: { aoiBbox, requestedDateTarget: today, candidates: [] } as unknown as object },
    });
    enqueued++;
  }
  return enqueued;
}

/** The cron entry point: enumerate tenants (least-privilege) and sweep each. Bounded per tenant per run. */
export async function runNdviJobSweep(deps: NdviSweepDeps = {}): Promise<NdviSweepSummary> {
  const orgIds = deps.orgIds ?? (await listAllOrgIds());
  const summary: NdviSweepSummary = { orgs: orgIds.length, claimed: 0, completed: 0, withheld: 0, failed: 0, autoAddEnqueued: 0 };
  try {
    for (const tenantId of orgIds) {
      const t = await runAsTenant(tenantId, async () => await sweepTenant(deps));
      summary.claimed += t.claimed;
      summary.completed += t.completed;
      summary.withheld += t.withheld;
      summary.failed += t.failed;
      summary.autoAddEnqueued += t.autoAddEnqueued;
    }
  } finally {
    if (!deps.orgIds) await disconnectEnumerator();
  }
  return summary;
}
