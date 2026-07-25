import "server-only";

/**
 * Vineyard Intelligence P2 — the scene-processing core (Unit 4, council C1/Q4/C4/S1).
 *
 * Turns a PENDING SpatialAnalysisJob into a stored NDVI raster + SpatialDataset + per-block metrics,
 * exactly once, via IDEMPOTENT MATERIALIZATION (not naive exactly-once fetch):
 *
 *   1. compute datasetIdentity = hash(tenantId, vineyardId, providerSceneId, recipeHash);
 *   2. CLAIM an INFLIGHT SpatialDataset placeholder on the (tenantId, datasetIdentity) unique BEFORE the
 *      external fetch — the DB unique IS the lock. A second concurrent claimant's create hits P2002 and
 *      BACKS OFF (never re-fetches → no double request-spend). A prior READY row is ADOPTED.
 *   3. fetch → decode → NDVI → inline block metrics (Q4, raster already in memory) → store raster at a
 *      DETERMINISTIC key derived from the identity → flip the dataset READY + full provenance + insert the
 *      metrics + finalize the job, all in one SERIALIZABLE runLedgerWrite tx.
 *
 * Fault → status: quota(402) → WITHHELD (quota-exhausted, not reclaimed till next billing window);
 * validation → FAILED; transient/rate_limit → THROW so the sweep retries under the lease. Mask-breaking
 * geometry → WITHHELD (mask-breaking), no metrics. A scene too cloudy over the AOI (every block below the
 * valid floor) is a selection-miss → auto-advance to the next of the top-3 candidates (C4). Memory (S1):
 * source TIFF bytes released post-decode, red/nir dropped post-NDVI (in computeNdvi), sequential reducers.
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant/context";
import { runLedgerWrite } from "@/lib/ledger/write";
import { fetchProcessedScene, SatelliteFault } from "./client";
import { copernicusAttribution } from "./config";
import { decodeNdviScene, type DecodedNdviScene } from "./decode";
import { putPrivateRaster, hasBlobCredentials, type StoredRaster } from "./raster-store";
import { computeNdvi, type NdviRaster } from "../ndvi";
import { recordCdseUsage } from "@/lib/spatial/usage-core";
import { computeBlockMetricsCore, type BlockGeometryInput, type ComputedBlockMetric, type SceneGeotransform } from "@/lib/spatial/block-metrics-core";
import type { VineyardPolygon } from "../geometry";

/** The NDVI recipe version. Bump ⇒ a new datasetIdentity ⇒ a fresh materialization coexists with the old. */
export const NDVI_ALGORITHM_VERSION = "ndvi-1";
export const NDVI_RESAMPLING = "NEAREST";
export const NDVI_MASK_DILATION = 0;

/** PURE: the recipe fingerprint baked into the identity — harmonize + mask policy + resampling + algo. */
export function recipeHash(): string {
  const recipe = { harmonizeValues: false, mask: "SCL:VEGETATION,BARE_SOIL", resampling: NDVI_RESAMPLING, maskDilation: NDVI_MASK_DILATION, algorithm: NDVI_ALGORITHM_VERSION };
  return createHash("sha256").update(JSON.stringify(recipe)).digest("hex").slice(0, 16);
}

/** PURE: the up-front idempotency key (council C1). Same (tenant, vineyard, scene, recipe) ⇒ same identity. */
export function computeDatasetIdentity(tenantId: string, vineyardId: string, providerSceneId: string): string {
  return createHash("sha256").update([tenantId, vineyardId, providerSceneId, recipeHash()].join("|")).digest("hex").slice(0, 40);
}

export type JobFaultClass = "quota" | "rate_limit" | "validation" | "transient";
export type JobWithheldReason = "quota-exhausted" | "selection-miss" | "low-coverage" | "mask-breaking" | "no-candidates";

/** PURE: map a provider fault to the job's terminal disposition (or `retry` to let the lease re-drive). */
export function faultToDisposition(fault: SatelliteFault): { status: "WITHHELD" | "FAILED" | "retry"; faultClass: JobFaultClass; withheldReason?: JobWithheldReason } {
  switch (fault.kind) {
    case "quota":
      return { status: "WITHHELD", faultClass: "quota", withheldReason: "quota-exhausted" };
    case "validation":
    case "not_found":
      return { status: "FAILED", faultClass: "validation" };
    case "rate_limit":
      return { status: "retry", faultClass: "rate_limit" };
    default: // transient / auth / unknown → retry under the lease (auth is a transient env problem here)
      return { status: "retry", faultClass: "transient" };
  }
}

export type SceneJobCandidate = {
  readonly providerSceneId: string;
  readonly acquiredAt: string | null;
  readonly cloudCover: number | null;
  readonly processingVersion: string | null;
  readonly bbox: [number, number, number, number] | null;
};

/** The job payload, parsed from SpatialAnalysisJob.params. */
export type SceneJobParams = {
  readonly aoiBbox: [number, number, number, number];
  readonly requestedDateTarget: string;
  readonly candidates: SceneJobCandidate[];
};

export type ProcessSceneJob = { id: string; vineyardId: string; params: unknown };

export type ProcessSceneDeps = {
  readonly fetchScene?: typeof fetchProcessedScene;
  readonly decode?: typeof decodeNdviScene;
  readonly putRaster?: typeof putPrivateRaster;
  readonly recordUsage?: typeof recordCdseUsage;
  readonly loadMask?: (vineyardId: string) => Promise<VineyardMask | null>;
  readonly now?: () => Date;
};

export type VineyardMask = {
  readonly planting: { id: string; geometry: VineyardPolygon };
  readonly blocks: BlockGeometryInput[];
};

export type ProcessSceneOutcome =
  | { readonly status: "COMPLETED"; readonly datasetId: string; readonly sceneId: string; readonly metricCount: number; readonly adopted: boolean }
  | { readonly status: "WITHHELD"; readonly withheldReason: JobWithheldReason; readonly faultClass?: JobFaultClass }
  | { readonly status: "FAILED"; readonly faultClass: JobFaultClass; readonly error: string }
  // Another worker holds a fresh INFLIGHT placeholder for this identity — leave the job to re-drive, no re-fetch.
  | { readonly status: "BACKOFF" };

/** Parse + validate the job params. Throws on a malformed payload (a programming error, not a scene fault). */
export function parseSceneJobParams(params: unknown): SceneJobParams {
  const p = params as Partial<SceneJobParams> | null;
  if (!p || !Array.isArray(p.aoiBbox) || p.aoiBbox.length !== 4 || typeof p.requestedDateTarget !== "string" || !Array.isArray(p.candidates)) {
    throw new Error("SpatialAnalysisJob.params is malformed (expected aoiBbox, requestedDateTarget, candidates)");
  }
  return { aoiBbox: p.aoiBbox as [number, number, number, number], requestedDateTarget: p.requestedDateTarget, candidates: p.candidates };
}

/** Default mask loader: the vineyard's confirmed planting area (union not needed for a single-planting estate)
 *  + its blocks with polygons. Reads via the tenant-scoped extended client. */
async function defaultLoadMask(vineyardId: string): Promise<VineyardMask | null> {
  const planting = await prisma.vineyardPlantingArea.findFirst({ where: { vineyardId }, orderBy: { sortOrder: "asc" } });
  if (!planting) return null;
  const blocks = await prisma.vineyardBlock.findMany({ where: { vineyardId, plantingAreaId: planting.id } });
  const withPoly: BlockGeometryInput[] = blocks
    .filter((b) => b.polygon != null)
    .map((b) => ({ id: b.id, geometry: b.polygon as unknown as VineyardPolygon, geometryVersion: b.geometryVersion, geometryFingerprint: b.geometryFingerprint ?? "" }));
  return { planting: { id: planting.id, geometry: planting.geometry as unknown as VineyardPolygon }, blocks: withPoly };
}

/**
 * Process one scene job. Tries the top-3 candidates in order (auto-advance on a selection-miss), materializes
 * the first that clears the AOI valid-coverage floor. Runs under the job's tenant ALS context.
 */
export async function processSceneJobCore(job: ProcessSceneJob, deps: ProcessSceneDeps = {}): Promise<ProcessSceneOutcome> {
  const tenantId = requireTenantId();
  const fetchScene = deps.fetchScene ?? fetchProcessedScene;
  const decode = deps.decode ?? decodeNdviScene;
  const putRaster = deps.putRaster ?? putPrivateRaster;
  const recordUsage = deps.recordUsage ?? recordCdseUsage;
  const loadMask = deps.loadMask ?? defaultLoadMask;

  const params = parseSceneJobParams(job.params);
  if (params.candidates.length === 0) return { status: "WITHHELD", withheldReason: "no-candidates" };
  if (!hasBlobCredentials()) throw new Error("BLOB_READ_WRITE_TOKEN is not set — cannot store the raster");

  const mask = await loadMask(job.vineyardId);
  if (!mask) return { status: "FAILED", faultClass: "validation", error: "vineyard has no confirmed planting area / block geometry" };

  let lastMiss: JobWithheldReason = "selection-miss";
  for (const candidate of params.candidates) {
    const identity = computeDatasetIdentity(tenantId, job.vineyardId, candidate.providerSceneId);

    // Immutable scene row (upsert by natural key). Kept idempotent so a retry does not duplicate it.
    const scene = await upsertScene(job.vineyardId, candidate, params);

    // CLAIM the INFLIGHT placeholder (C1). A concurrent claimant's create hits P2002 → back off / adopt.
    const claim = await claimDataset(job.vineyardId, scene.id, identity);
    if (claim.kind === "adopt") {
      return { status: "COMPLETED", datasetId: claim.datasetId, sceneId: scene.id, metricCount: claim.metricCount, adopted: true };
    }
    if (claim.kind === "backoff") {
      // Another worker holds a fresh INFLIGHT placeholder for this identity — do NOT re-fetch. The sweep
      // re-drives this job after the other worker finalizes (or its lease lapses).
      return { status: "BACKOFF" };
    }
    const datasetId = claim.datasetId;

    // FETCH (billable — count the attempt whether it succeeds or fails, S6).
    let bytes: Uint8Array;
    let processingUnits: number | null = null;
    try {
      const res = await fetchScene({ bbox: params.aoiBbox, fromIso: windowFrom(candidate, params), toIso: windowTo(candidate, params), maxCloudCoveragePct: undefined });
      bytes = res.bytes;
      processingUnits = res.processingUnits;
      await recordUsage({ requests: 1, processingUnits: processingUnits ?? 0 });
    } catch (e) {
      await recordUsage({ requests: 1 });
      if (e instanceof SatelliteFault) {
        const d = faultToDisposition(e);
        await failDataset(datasetId);
        if (d.status === "retry") throw e; // let the sweep retry under the lease
        if (d.status === "WITHHELD") return { status: "WITHHELD", withheldReason: d.withheldReason!, faultClass: d.faultClass };
        return { status: "FAILED", faultClass: d.faultClass, error: e.message };
      }
      throw e;
    }

    // DECODE → NDVI → inline block metrics (Q4 — raster already in memory, no blob reload). Memory (S1):
    // computeNdvi returns a fresh NdviRaster; the large source `bytes` + decoded bands become collectable
    // once metrics are computed below (we hold only `ndvi.values` through the block loop).
    const decoded = await decode(bytes);
    const ndvi: NdviRaster = computeNdvi(decoded.red, decoded.nir, roundedScl(decoded.scl), decoded.width, decoded.height);
    const geotransform: SceneGeotransform = {
      originX: decoded.originX, originY: decoded.originY, pixelSizeM: decoded.pixelSizeM,
      axisYSign: decoded.axisYSign, crsEpsg: decoded.crsEpsg, width: decoded.width, height: decoded.height,
    };
    const result = computeBlockMetricsCore({ ndvi, geotransform, planting: mask.planting, blocks: mask.blocks });
    if (result.refused) {
      await failDataset(datasetId);
      return { status: "WITHHELD", withheldReason: "mask-breaking" };
    }
    // AOI valid-coverage: if EVERY block fell below the valid floor, this scene is too cloudy over the AOI.
    const anyValid = result.metrics.some((m) => m.mean !== null);
    if (!anyValid && result.metrics.length > 0) {
      await failDataset(datasetId);
      lastMiss = "low-coverage";
      continue; // auto-advance (C4)
    }

    // STORE the raster at the deterministic key, then finalize atomically.
    const stored = await putRaster(tenantId, identity, bytes);
    await finalizeDataset({ datasetId, jobId: job.id, sceneId: scene.id, decoded, stored, processingUnits, attribution: scene.attribution, baseline: scene.processingBaseline, acquiredAt: scene.acquiredAt, metrics: result.metrics });
    return { status: "COMPLETED", datasetId, sceneId: scene.id, metricCount: result.metrics.length, adopted: false };
  }

  return { status: "WITHHELD", withheldReason: lastMiss };
}

// ── DB helpers (tenant-scoped via the extended client) ───────────────────────────────────────────────

async function upsertScene(vineyardId: string, candidate: SceneJobCandidate, params: SceneJobParams) {
  const providerSceneId = candidate.providerSceneId;
  const existing = await prisma.spatialScene.findFirst({ where: { vineyardId, providerSceneId } });
  if (existing) return existing;
  const acquiredAt = candidate.acquiredAt ? new Date(candidate.acquiredAt) : new Date(params.requestedDateTarget);
  const baseline = candidate.processingVersion ?? "unknown";
  return prisma.spatialScene.create({
    data: {
      vineyardId, provider: "CDSE", collection: "sentinel-2-l2a", providerSceneId,
      requestedDateTarget: new Date(params.requestedDateTarget), acquiredAt,
      bounds: { type: "bbox", coordinates: candidate.bbox ?? params.aoiBbox } as unknown as object,
      sceneCloudCover: (candidate.cloudCover ?? 0).toFixed(3),
      processingBaseline: baseline, processingLevel: "L2A",
      selectionReason: `footprint-contained; tile cloud ${candidate.cloudCover ?? "?"}%`,
      attribution: copernicusAttribution(acquiredAt.getUTCFullYear()),
    },
  });
}

type ClaimResult =
  | { kind: "claimed"; datasetId: string }
  | { kind: "adopt"; datasetId: string; metricCount: number }
  | { kind: "backoff" };

async function resolveExisting(datasetIdentity: string): Promise<ClaimResult | null> {
  const existing = await prisma.spatialDataset.findFirst({ where: { datasetIdentity } });
  if (!existing) return null;
  if (existing.status === "READY") {
    const metricCount = await prisma.blockSpatialMetric.count({ where: { datasetId: existing.id } });
    return { kind: "adopt", datasetId: existing.id, metricCount };
  }
  if (existing.status === "FAILED") {
    await prisma.spatialDataset.update({ where: { id: existing.id }, data: { status: "INFLIGHT" } });
    return { kind: "claimed", datasetId: existing.id };
  }
  return { kind: "backoff" }; // INFLIGHT held by another worker
}

/** CLAIM the identity (C1). Check-first for the common idempotent re-run (adopt a READY / reclaim a FAILED
 *  row) so it doesn't trip the unique; the create+catch handles the genuine concurrent first-claim race. */
async function claimDataset(vineyardId: string, sceneId: string, datasetIdentity: string): Promise<ClaimResult> {
  const pre = await resolveExisting(datasetIdentity);
  if (pre) return pre;
  try {
    const ds = await prisma.spatialDataset.create({
      data: { vineyardId, sceneId, datasetIdentity, status: "INFLIGHT", algorithmVersion: NDVI_ALGORITHM_VERSION, harmonizeValues: false, maskDilation: NDVI_MASK_DILATION, sclResampling: NDVI_RESAMPLING },
    });
    return { kind: "claimed", datasetId: ds.id };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // Lost the race: another worker inserted the placeholder between our check and create.
    const raced = await resolveExisting(datasetIdentity);
    if (!raced) throw e;
    return raced;
  }
}

async function failDataset(datasetId: string): Promise<void> {
  await prisma.spatialDataset.update({ where: { id: datasetId }, data: { status: "FAILED" } });
}

async function finalizeDataset(input: {
  datasetId: string; jobId: string; sceneId: string; decoded: DecodedNdviScene; stored: StoredRaster;
  processingUnits: number | null; attribution: string; baseline: string; acquiredAt: Date; metrics: ComputedBlockMetric[];
}): Promise<void> {
  const { decoded } = input;
  await runLedgerWrite(async (tx) => {
    const ds = await tx.spatialDataset.update({
      where: { id: input.datasetId },
      data: {
        status: "READY", blobUrl: input.stored.url, blobKey: input.stored.key, blobSha256: input.stored.sha256, byteSize: input.stored.byteSize,
        crsEpsg: decoded.crsEpsg, originX: decoded.originX.toString(), originY: decoded.originY.toString(), pixelSizeM: decoded.pixelSizeM.toString(),
        gridWidth: decoded.width, gridHeight: decoded.height, axisYSign: decoded.axisYSign,
        processingUnits: input.processingUnits?.toString() ?? null, processingBaseline: input.baseline, attribution: input.attribution,
      },
      select: { vineyardId: true },
    });
    for (const m of input.metrics) {
      await tx.blockSpatialMetric.create({
        data: {
          blockId: m.blockId, datasetId: input.datasetId, vineyardId: ds.vineyardId,
          metric: "NDVI", acquiredAt: input.acquiredAt,
          min: dec(m.min), p10: dec(m.p10), p25: dec(m.p25), median: dec(m.median), mean: dec(m.mean), p75: dec(m.p75), p90: dec(m.p90), max: dec(m.max), stdDev: dec(m.stdDev),
          intersectingPixelCount: m.intersectingPixelCount, validPixelCount: m.validPixelCount, effectivePixelCount: m.effectivePixelCount.toString(),
          validFraction: m.validFraction.toString(), coveredAreaM2: m.coveredAreaM2.toString(), mixedPixelShare: m.mixedPixelShare.toString(),
          qualityFlags: m.qualityFlags, geometryVersion: m.geometryVersion, geometryFingerprint: m.geometryFingerprint,
        },
      });
    }
    await tx.spatialAnalysisJob.update({ where: { id: input.jobId }, data: { status: "COMPLETED", datasetId: input.datasetId, sceneId: input.sceneId } });
  });
}

// ── small pure utilities ─────────────────────────────────────────────────────────────────────────────

const dec = (v: number | null): string | null => (v === null ? null : v.toString());

/** SCL DN carried as float → rounded integer classes for the mask (NEAREST guarantees integers already). */
export function roundedScl(scl: Float32Array): Uint8Array {
  const out = new Uint8Array(scl.length);
  for (let i = 0; i < scl.length; i++) out[i] = Math.round(scl[i]);
  return out;
}

function windowFrom(c: SceneJobCandidate, p: SceneJobParams): string {
  const anchor = c.acquiredAt ?? p.requestedDateTarget;
  return new Date(Date.parse(anchor) - 86_400_000).toISOString();
}
function windowTo(c: SceneJobCandidate, p: SceneJobParams): string {
  const anchor = c.acquiredAt ?? p.requestedDateTarget;
  return new Date(Date.parse(anchor) + 86_400_000).toISOString();
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
