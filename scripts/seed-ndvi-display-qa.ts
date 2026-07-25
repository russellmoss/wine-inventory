/**
 * seed-ndvi-display-qa — create a PERSISTENT QA vineyard in Demo Winery with a READY NDVI scene, so the P3
 * map has real data to render in the browser. Runs the REAL processSceneJobCore against the committed fixture
 * (injected transport) with the REAL blob writer, so the dataset's blobUrl is a genuine private blob the
 * display route can read back + warp. Idempotent: drops + recreates the QA vineyard each run.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/seed-ndvi-display-qa.ts
 *
 * Demo Winery ONLY. QA-prefixed. Never touches Bhutan. Remove with the cleanup at the bottom (pass --clean).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { decodeNdviScene } from "@/lib/gis/satellite/decode";
import { processSceneJobCore } from "@/lib/gis/satellite/process-scene-core";
import { hasBlobCredentials } from "@/lib/gis/satellite/raster-store";
import { createProjectorFromAnchor } from "@/lib/gis/projection";
import type { VineyardPolygon } from "@/lib/gis/geometry";

const TENANT = "org_demo_winery";
const TIF = readFileSync(join(process.cwd(), "test", "fixtures", "gis", "ndvi-scene.tif"));
const REF = JSON.parse(readFileSync(join(process.cwd(), "test", "fixtures", "gis", "ndvi-scene-reference.json"), "utf8")) as {
  provenance: { sceneId: string; acquiredAt: string; sceneCloudCover: number | null; processingBaseline: string };
};

const V = "qa_ndvi_display_vy";
const PA = "qa_ndvi_display_pa";
const BLK = ["qa_ndvi_display_blk_a", "qa_ndvi_display_blk_b"];
const JOB = "qa_ndvi_display_job";

async function cleanup() {
  await prisma.blockSpatialMetric.deleteMany({ where: { vineyardId: V } });
  await prisma.spatialDatasetDerivative.deleteMany({ where: { vineyardId: V } });
  await prisma.spatialAnalysisJob.deleteMany({ where: { vineyardId: V } });
  await prisma.spatialDataset.deleteMany({ where: { vineyardId: V } });
  await prisma.spatialScene.deleteMany({ where: { vineyardId: V } });
  await prisma.vineyardBlock.deleteMany({ where: { vineyardId: V } });
  await prisma.vineyardPlantingArea.deleteMany({ where: { vineyardId: V } });
  await prisma.vineyardDetail.deleteMany({ where: { vineyardId: V } });
  await prisma.vineyard.deleteMany({ where: { id: V } });
}

async function main() {
  const clean = process.argv.includes("--clean");
  if (!hasBlobCredentials()) {
    console.error("No blob credentials — cannot store a real raster. Set BLOB_READ_WRITE_TOKEN.");
    process.exit(1);
  }

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
  const blockGeom = [rect(50, 50, 150, 150), rect(200, 200, 300, 300)];
  const [clon, clat] = projector.inverse([fullW / 2, fullH / 2]);
  const corners = [projector.inverse([20, 20]), projector.inverse([fullW - 20, 20]), projector.inverse([fullW - 20, fullH - 20]), projector.inverse([20, fullH - 20])];
  const lons = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);
  const aoiBbox: [number, number, number, number] = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];

  await runAsTenant(TENANT, async () => {
    await cleanup();
    if (clean) {
      console.log("Cleaned QA NDVI-display fixtures.");
      return;
    }

    await prisma.vineyard.create({ data: { id: V, name: "QA NDVI Display" } });
    await prisma.vineyardDetail.create({ data: { vineyardId: V, gpsLat: clat.toFixed(6), gpsLng: clon.toFixed(6), defaultUnit: "imperial" } });
    await prisma.vineyardPlantingArea.create({ data: { id: PA, vineyardId: V, name: "QA Planting", geometry: plantingGeom as unknown as object, geometryFingerprint: "qa-fp", canonicalAnchor: { epsg: `EPSG:${scene.crsEpsg}` } as unknown as object, source: "DRAW", reviewStatus: "CONFIRMED" } });
    for (let i = 0; i < BLK.length; i++) {
      await prisma.vineyardBlock.create({ data: { id: BLK[i], vineyardId: V, plantingAreaId: PA, blockLabel: `QA Block ${i + 1}`, polygon: blockGeom[i] as unknown as object, geometryVersion: 1, geometryFingerprint: `qa-blk-${i}`, sortOrder: i } });
    }

    const candidate = {
      providerSceneId: REF.provenance.sceneId,
      acquiredAt: REF.provenance.acquiredAt,
      cloudCover: REF.provenance.sceneCloudCover,
      processingVersion: REF.provenance.processingBaseline,
      bbox: aoiBbox,
    };
    const params = { aoiBbox, requestedDateTarget: REF.provenance.acquiredAt, candidates: [candidate] };
    await prisma.spatialAnalysisJob.create({ data: { id: JOB, vineyardId: V, idempotencyKey: `qa:${JOB}`, params: params as unknown as object } });

    // REAL putRaster (default) → a genuine private blob; only the provider fetch is injected.
    const out = await processSceneJobCore(
      { id: JOB, vineyardId: V, params },
      { fetchScene: async () => ({ bytes: new Uint8Array(TIF), processingUnits: 0.0286, contentType: "image/tiff" }) },
    );
    console.log(`Processed: ${out.status}` + (out.status === "COMPLETED" ? ` — dataset ${out.datasetId}, ${out.metricCount} block metrics` : ""));
    // SYSTEM style presets (idempotent) so the style dropdown has options in the demo.
    const presets = [
      { name: "Vigour (relative)", mode: "VINEYARD_SCENE", paletteId: "vigor-classic", reverse: false },
      { name: "Absolute (colour-safe)", mode: "ABSOLUTE", paletteId: "color-vision-safe", reverse: false, fixedMin: "-0.2000", fixedMax: "0.9000" },
    ];
    for (const p of presets) {
      const exists = await prisma.spatialStyle.findFirst({ where: { scope: "SYSTEM", metric: "NDVI", name: p.name } });
      if (!exists) await prisma.spatialStyle.create({ data: { scope: "SYSTEM", metric: "NDVI", ...p } });
    }

    const ds = await prisma.spatialDataset.findFirst({ where: { vineyardId: V, status: "READY" }, select: { id: true, blobUrl: true } });
    console.log(`READY dataset: ${ds?.id} (blob ${ds?.blobUrl ? "stored" : "MISSING"})`);
    console.log(`Vineyard "${V}" centre ${clat.toFixed(5)}, ${clon.toFixed(5)}. Open /vineyards/ndvi?vineyard=${V}`);
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FAILED:", (e as Error)?.message, (e as Error)?.stack);
  process.exit(1);
});
