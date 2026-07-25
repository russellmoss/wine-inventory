/**
 * verify:ndvi — the P2 data-layer end-to-end proof (Unit 9). Runs on the Demo Winery sandbox against the
 * committed FIXTURE scene (no live provider), driving the REAL processSceneJobCore so the whole path is
 * exercised: decode → NDVI → inline block metrics → SpatialDataset(READY) + BlockSpatialMetric rows in the
 * DB, with full provenance. Also proves the council C1 idempotency (a second job ADOPTS, does not re-fetch),
 * the quota counter, and the MASK_BREAKING refusal.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/verify-ndvi.ts
 *
 * QA-prefixed fixtures in Demo Winery ONLY; cleaned up at the end. Never touches Bhutan.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { decodeNdviScene } from "@/lib/gis/satellite/decode";
import { processSceneJobCore } from "@/lib/gis/satellite/process-scene-core";
import { computeBlockMetricsCore } from "@/lib/spatial/block-metrics-core";
import { computeNdvi } from "@/lib/gis/ndvi";
import { roundedScl } from "@/lib/gis/satellite/process-scene-core";
import { readCdseUsage } from "@/lib/spatial/usage-core";
import { createProjectorFromAnchor } from "@/lib/gis/projection";
import type { VineyardPolygon } from "@/lib/gis/geometry";

const TENANT = "org_demo_winery";
const TIF = readFileSync(join(process.cwd(), "test", "fixtures", "gis", "ndvi-scene.tif"));
const REF = JSON.parse(readFileSync(join(process.cwd(), "test", "fixtures", "gis", "ndvi-scene-reference.json"), "utf8")) as {
  provenance: { sceneId: string; acquiredAt: string; sceneCloudCover: number | null; processingBaseline: string };
};

const V = "qa_ndvi_vy";
const PA = "qa_ndvi_pa";
const BLK = ["qa_ndvi_blk_a", "qa_ndvi_blk_b"];
const JOB1 = "qa_ndvi_job1";
const JOB2 = "qa_ndvi_job2";

let failures = 0;
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "✓" : "✗"}  ${label}${extra ? `  — ${extra}` : ""}`);
  if (!ok) failures++;
};

async function main() {
  // Decode the fixture once to recover its frame, then build QA geometry INSIDE its footprint.
  const scene = await decodeNdviScene(new Uint8Array(TIF));
  const bottomY = scene.originY - scene.height * scene.pixelSizeM;
  const projector = createProjectorFromAnchor({ epsg: `EPSG:${scene.crsEpsg}`, originX: scene.originX, originY: bottomY });
  const rect = (x0: number, y0: number, x1: number, y1: number): VineyardPolygon => ({
    type: "Polygon",
    coordinates: [[projector.inverse([x0, y0]), projector.inverse([x1, y0]), projector.inverse([x1, y1]), projector.inverse([x0, y1]), projector.inverse([x0, y0])]],
  });
  const fullW = scene.width * scene.pixelSizeM;
  const fullH = scene.height * scene.pixelSizeM;
  const plantingGeom = rect(20, 20, fullW - 20, fullH - 20);
  const blockGeom = [rect(50, 50, 150, 150), rect(200, 200, 300, 300)]; // two 100×100 m blocks, non-overlapping
  const corners = [projector.inverse([20, 20]), projector.inverse([fullW - 20, 20]), projector.inverse([fullW - 20, fullH - 20]), projector.inverse([20, fullH - 20])];
  const lons = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);
  const aoiBbox: [number, number, number, number] = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];

  await runAsTenant(TENANT, async () => {
    await cleanup();
    // Seed QA vineyard + planting area + blocks (QA-prefixed).
    await prisma.vineyard.create({ data: { id: V, name: "QA NDVI Vineyard" } });
    await prisma.vineyardPlantingArea.create({ data: { id: PA, vineyardId: V, name: "QA NDVI Planting", geometry: plantingGeom as unknown as object, geometryFingerprint: "qa-fp", canonicalAnchor: { epsg: `EPSG:${scene.crsEpsg}` } as unknown as object, source: "DRAW", reviewStatus: "CONFIRMED" } });
    for (let i = 0; i < BLK.length; i++) {
      await prisma.vineyardBlock.create({ data: { id: BLK[i], vineyardId: V, plantingAreaId: PA, blockLabel: `QA ${i}`, polygon: blockGeom[i] as unknown as object, geometryVersion: 1, geometryFingerprint: `qa-blk-${i}` } });
    }

    const candidate = {
      providerSceneId: REF.provenance.sceneId,
      acquiredAt: REF.provenance.acquiredAt,
      cloudCover: REF.provenance.sceneCloudCover,
      processingVersion: REF.provenance.processingBaseline,
      bbox: aoiBbox,
    };
    const params = { aoiBbox, requestedDateTarget: REF.provenance.acquiredAt, candidates: [candidate] };
    await prisma.spatialAnalysisJob.create({ data: { id: JOB1, vineyardId: V, idempotencyKey: `qa:${JOB1}`, params: params as unknown as object } });

    // ── Drive the REAL core with injected transport (fixture bytes + mock blob), real DB + metrics + usage.
    let fetchCalls = 0;
    const deps = {
      fetchScene: async () => {
        fetchCalls++;
        return { bytes: new Uint8Array(TIF), processingUnits: 0.0286, contentType: "image/tiff" };
      },
      putRaster: async (_t: string, identity: string, bytes: Uint8Array) => ({ url: `blob://qa/${identity}`, key: `qa/${identity}.tif`, sha256: "qa-sha", byteSize: bytes.byteLength }),
    };
    const usageBefore = await readCdseUsage();
    const out1 = await processSceneJobCore({ id: JOB1, vineyardId: V, params }, deps);
    check("job COMPLETED", out1.status === "COMPLETED", out1.status);
    if (out1.status === "COMPLETED") {
      check("fetched exactly once", fetchCalls === 1, `calls=${fetchCalls}`);
      check("materialized a metric per block (2)", out1.metricCount === 2, `count=${out1.metricCount}`);

      // Read the per-block NDVI means BACK from the DB — the proof the data landed.
      const metrics = await prisma.blockSpatialMetric.findMany({ where: { datasetId: out1.datasetId }, orderBy: { blockId: "asc" } });
      check("2 BlockSpatialMetric rows persisted", metrics.length === 2, `rows=${metrics.length}`);
      const means = metrics.map((m) => (m.mean === null ? null : Number(m.mean)));
      check("every block has a non-null NDVI mean in [-1,1]", means.every((v) => v !== null && v >= -1 && v <= 1), JSON.stringify(means));
      check("block means are stamped geometryVersion 1", metrics.every((m) => m.geometryVersion === 1));
      check("valid fraction is high (SCL veg/soil over the AOI)", metrics.every((m) => Number(m.validFraction) >= 0.5));

      // Provenance on the dataset (the radiometric contract, recorded).
      const ds = await prisma.spatialDataset.findUnique({ where: { id: out1.datasetId } });
      check("dataset is READY", ds?.status === "READY");
      check("provenance: harmonizeValues = false", ds?.harmonizeValues === false);
      check("provenance: SCL resampling NEAREST", ds?.sclResampling === "NEAREST");
      check("provenance: processing baseline recorded", !!ds?.processingBaseline && ds.processingBaseline !== "unknown", ds?.processingBaseline ?? "");
      check("provenance: Copernicus attribution present", (ds?.attribution ?? "").toLowerCase().includes("copernicus"), ds?.attribution ?? "");
      check("provenance: typed geotransform stored (epsg + pixel size + axis)", ds?.crsEpsg === scene.crsEpsg && !!ds?.pixelSizeM && ds?.axisYSign === -1);

      // Scene immutability provenance.
      const sc = await prisma.spatialScene.findUnique({ where: { id: out1.sceneId } });
      check("scene records requested-vs-acquired axis (acquiredAt)", !!sc?.acquiredAt);

      // ── C1 idempotency: a SECOND job for the same scene ADOPTS the READY dataset, does NOT re-fetch.
      await prisma.spatialAnalysisJob.create({ data: { id: JOB2, vineyardId: V, idempotencyKey: `qa:${JOB2}`, params: params as unknown as object } });
      const out2 = await processSceneJobCore({ id: JOB2, vineyardId: V, params }, deps);
      check("second job ADOPTS the existing dataset (no re-fetch — C1)", out2.status === "COMPLETED" && (out2 as { adopted: boolean }).adopted === true && fetchCalls === 1, `status=${out2.status} calls=${fetchCalls}`);
      // The adopt path must persist COMPLETED to the JOB ROW too (not just the return value) — else the job
      // leaks at IN_FLIGHT in the UI. This is the regression the browser QA caught.
      const job2Row = await prisma.spatialAnalysisJob.findUnique({ where: { id: JOB2 }, select: { status: true, datasetId: true } });
      check("adopted job ROW is COMPLETED (not stuck IN_FLIGHT)", job2Row?.status === "COMPLETED" && job2Row.datasetId === out1.datasetId, `row=${job2Row?.status}`);

      // Quota counter incremented (billable attempts).
      const usageAfter = await readCdseUsage();
      check("CDSE usage counter incremented (requests + PU)", usageAfter.requestCount > usageBefore.requestCount && usageAfter.processingUnits > usageBefore.processingUnits);
    }

    // ── MASK_BREAKING refusal contract (pure core, no fetch): two overlapping blocks → refused, no metrics.
    const ndvi = computeNdvi(scene.red, scene.nir, roundedScl(scene.scl), scene.width, scene.height);
    const geot = { originX: scene.originX, originY: scene.originY, pixelSizeM: scene.pixelSizeM, axisYSign: scene.axisYSign, crsEpsg: scene.crsEpsg, width: scene.width, height: scene.height };
    const broken = computeBlockMetricsCore({
      ndvi, geotransform: geot, planting: { id: PA, geometry: plantingGeom },
      blocks: [
        { id: "ov1", geometry: rect(50, 50, 200, 200), geometryVersion: 1, geometryFingerprint: "f1" },
        { id: "ov2", geometry: rect(150, 150, 300, 300), geometryVersion: 1, geometryFingerprint: "f2" },
      ],
    });
    check("MASK_BREAKING mask is REFUSED (no metrics written)", broken.refused === true && (broken as { reason: string }).reason === "mask-breaking");

    await cleanup();
  });

  console.log(failures === 0 ? "\nVERIFY:NDVI PASSED ✓" : `\n${failures} CHECK(S) FAILED ✗`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

async function cleanup() {
  await prisma.blockSpatialMetric.deleteMany({ where: { vineyardId: V } });
  await prisma.spatialAnalysisJob.deleteMany({ where: { vineyardId: V } });
  await prisma.spatialDataset.deleteMany({ where: { vineyardId: V } });
  await prisma.spatialScene.deleteMany({ where: { vineyardId: V } });
  await prisma.vineyardBlock.deleteMany({ where: { vineyardId: V } });
  await prisma.vineyardPlantingArea.deleteMany({ where: { vineyardId: V } });
  await prisma.vineyard.deleteMany({ where: { id: V } });
}

main().catch((e) => {
  console.error("FAILED:", (e as Error)?.name, (e as Error)?.message, (e as Error)?.stack);
  process.exit(1);
});
