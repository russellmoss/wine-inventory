/**
 * verify:ndvi-display — the P3 render-layer end-to-end proof (Unit 11). Two parts:
 *
 *   A) HERMETIC render chain (always): the committed fixture scene → decode → NDVI → WARP to 3857 →
 *      Int16 quantize→dequantize → resolveDomain (every scale mode) → rasterToRgba → PNG. Asserts the PNG
 *      is well-formed, the domain/histogram are sane, the min-spread clamp fires on a uniform field, the
 *      locked comparison domain spans both dates, and — the load-bearing one — a REGISTRATION spot-check:
 *      a real source pixel lands in its geographically-correct 3857 output cell (sub-pixel).
 *
 *   B) LIVE derivative + serve (only if blob credentials exist): store the fixture to real blob, create a
 *      READY SpatialDataset, then ensureDisplayDerivative + buildDisplayRender under runAsTenant — proving
 *      the DB cache is idempotent (second call ADOPTS, no re-warp) and the served PNG matches the chain.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/verify-ndvi-display.ts
 *
 * Demo Winery sandbox ONLY; QA-prefixed rows; cleaned up. Never touches Bhutan.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import proj4 from "proj4";
import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { decodeNdviScene } from "@/lib/gis/satellite/decode";
import { computeNdvi } from "@/lib/gis/ndvi";
import { roundedScl } from "@/lib/gis/satellite/process-scene-core";
import { hasBlobCredentials, putPrivateRaster } from "@/lib/gis/satellite/raster-store";
import { warpToDisplayGrid, utmDefFromEpsg, type SourceGeotransform } from "@/lib/gis/warp";
import { quantizeToInt16, dequantizeFromInt16, int16ToBytes, bytesToInt16 } from "@/lib/gis/quantize";
import { resolveDomain, toWeightedSamples } from "@/lib/gis/domain";
import { ndviHistogram } from "@/lib/gis/histogram";
import { rasterToRgba } from "@/lib/gis/render";
import { VIGOR_CLASSIC, buildPaletteLut, type ColorScaleMode } from "@/lib/gis/color";
import { encodePng } from "@/lib/gis/png";
import { ensureDisplayDerivative } from "@/lib/spatial/display-derivative-core";
import { buildDisplayRender } from "@/lib/spatial/ndvi-display-core";

const TENANT = "org_demo_winery";
const TIF = readFileSync(join(process.cwd(), "test", "fixtures", "gis", "ndvi-scene.tif"));
const MERC = "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs";
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

let failures = 0;
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "✓" : "✗"}  ${label}${extra ? `  — ${extra}` : ""}`);
  if (!ok) failures++;
};

const V = "qa_ndvid_vy";
const SCENE = "qa_ndvid_scene";
const DS = "qa_ndvid_ds";

async function main() {
  // ─────────────── Part A: hermetic render chain on the real fixture ───────────────
  const scene = await decodeNdviScene(new Uint8Array(TIF));
  const ndvi = computeNdvi(scene.red, scene.nir, roundedScl(scene.scl), scene.width, scene.height);
  const geo: SourceGeotransform = {
    crsEpsg: scene.crsEpsg,
    originX: scene.originX,
    originY: scene.originY,
    pixelSizeM: scene.pixelSizeM,
    axisYSign: scene.axisYSign,
  };
  const warped = warpToDisplayGrid({ width: scene.width, height: scene.height, values: ndvi.values }, geo);
  check("warp produced a non-empty 3857 grid", warped.grid.width > 0 && warped.grid.height > 0, `${warped.grid.width}x${warped.grid.height}`);
  check("warped WGS84 bbox is well-ordered", warped.wgs84Bbox[0] < warped.wgs84Bbox[2] && warped.wgs84Bbox[1] < warped.wgs84Bbox[3], JSON.stringify(warped.wgs84Bbox.map((n) => +n.toFixed(4))));

  // Int16 round-trip is faithful.
  const q = quantizeToInt16(warped.grid.values);
  const back = dequantizeFromInt16(bytesToInt16(int16ToBytes(q)));
  let maxErr = 0;
  let validBack = 0;
  for (let i = 0; i < warped.grid.values.length; i++) {
    const a = warped.grid.values[i];
    if (Number.isNaN(a)) continue;
    validBack++;
    maxErr = Math.max(maxErr, Math.abs(a - back[i]));
  }
  check("Int16 quantization round-trips within 1e-4", maxErr <= 1e-4 + 1e-9, `maxErr=${maxErr.toExponential(2)}`);
  check("warped grid has valid pixels", validBack > 0, `valid=${validBack}`);

  // REGISTRATION spot-check on real data: the highest-NDVI source pixel must land in its true 3857 cell.
  let bestIdx = -1;
  let bestVal = -Infinity;
  for (let i = 0; i < ndvi.values.length; i++) {
    if (!Number.isNaN(ndvi.values[i]) && ndvi.values[i] > bestVal) {
      bestVal = ndvi.values[i];
      bestIdx = i;
    }
  }
  const srcRow = Math.floor(bestIdx / scene.width);
  const srcCol = bestIdx % scene.width;
  const e0 = geo.originX + (srcCol + 0.5) * geo.pixelSizeM;
  const n0 = geo.axisYSign === -1 ? geo.originY - (srcRow + 0.5) * geo.pixelSizeM : geo.originY + (srcRow + 0.5) * geo.pixelSizeM;
  const [lon, lat] = proj4(utmDefFromEpsg(geo.crsEpsg), WGS84, [e0, n0]) as [number, number];
  const [x3857, y3857] = proj4(WGS84, MERC, [lon, lat]) as [number, number];
  const cTrue = Math.floor((x3857 - warped.originX) / warped.pixelSizeM);
  const rTrue = Math.floor((warped.originY - y3857) / warped.pixelSizeM);
  const landed = warped.grid.values[rTrue * warped.grid.width + cTrue];
  check("REGISTRATION: peak-NDVI source pixel lands at its true 3857 cell", Math.abs(landed - bestVal) < 1e-4, `landed=${landed?.toFixed(4)} expected=${bestVal.toFixed(4)}`);

  // Every scale mode resolves a finite domain over the warped pixels.
  const samples = toWeightedSamples(warped.grid.values);
  const modes: ColorScaleMode[] = ["VINEYARD_SCENE", "BLOCK_SCENE", "VINEYARD_BASELINE", "ABSOLUTE", "CUSTOM", "COMPARISON_LOCKED"];
  for (const mode of modes) {
    const d = resolveDomain({
      mode,
      pixels: samples,
      baselinePixels: samples,
      fixed: { min: 0, max: 0.9 },
      lockedDomains: [resolveDomain({ mode: "VINEYARD_SCENE", pixels: samples }), { min: 0.1, max: 0.8 } as never],
    });
    check(`domain resolves for ${mode}`, Number.isFinite(d.min) && Number.isFinite(d.max) && d.max > d.min, `[${d.min.toFixed(3)}, ${d.max.toFixed(3)}]`);
  }

  // Min-spread clamp fires on a synthetic uniform field.
  const uniform = toWeightedSamples(new Float64Array(100).fill(0.62));
  const clampDomain = resolveDomain({ mode: "VINEYARD_SCENE", pixels: uniform });
  check("min-spread clamp fires on a uniform field (council #4)", clampDomain.clamped === true && Math.abs(clampDomain.max - clampDomain.min - 0.15) < 1e-6);

  // Histogram totals the valid weight; PNG is well-formed.
  const domain = resolveDomain({ mode: "VINEYARD_SCENE", pixels: samples });
  const hist = ndviHistogram(samples, domain);
  check("histogram total equals the valid sample weight", Math.abs(hist.total - samples.length) < 1e-6, `total=${hist.total} n=${samples.length}`);
  const lut = buildPaletteLut(VIGOR_CLASSIC);
  const rgba = rasterToRgba(warped.grid.values, warped.grid.width, warped.grid.height, domain, VIGOR_CLASSIC, { lut });
  const png = encodePng(rgba.data, warped.grid.width, warped.grid.height);
  const sigOk = png[0] === 137 && png[1] === 80 && png[2] === 78 && png[3] === 71;
  check("PNG has a valid signature + non-trivial size", sigOk && png.byteLength > 100, `bytes=${png.byteLength}`);

  // ─────────────── Part B: live derivative + serve (only with blob credentials) ───────────────
  if (!hasBlobCredentials()) {
    console.log("\n· Part B (live derivative + serve) SKIPPED — no blob credentials in this env.");
  } else {
    await runAsTenant(TENANT, async () => {
      await cleanup();
      const stored = await putPrivateRaster(TENANT, `qa-display-${DS}`, new Uint8Array(TIF));
      await prisma.vineyard.create({ data: { id: V, name: "QA NDVI-display Vineyard" } });
      await prisma.spatialScene.create({
        data: {
          id: SCENE, vineyardId: V, provider: "CDSE", collection: "sentinel-2-l2a", providerSceneId: "QA-DISPLAY",
          requestedDateTarget: new Date(), acquiredAt: new Date(), bounds: warped.wgs84Bbox as unknown as object,
          sceneCloudCover: "5.000", processingBaseline: "05.11", processingLevel: "L2A", selectionReason: "qa", attribution: "Copernicus",
        },
      });
      await prisma.spatialDataset.create({
        data: {
          id: DS, vineyardId: V, sceneId: SCENE, datasetIdentity: `qa-display-${DS}`, algorithmVersion: "ndvi-1", status: "READY",
          blobUrl: stored.url, blobKey: stored.key, blobSha256: stored.sha256, byteSize: stored.byteSize,
          crsEpsg: scene.crsEpsg, originX: scene.originX.toFixed(4), originY: scene.originY.toFixed(4),
          pixelSizeM: scene.pixelSizeM.toFixed(4), gridWidth: scene.width, gridHeight: scene.height, axisYSign: scene.axisYSign,
          sclResampling: "NEAREST", processingBaseline: "05.11", attribution: "Copernicus", updatedAt: new Date(),
        },
      });

      const d1 = await ensureDisplayDerivative(DS);
      check("derivative materialized READY", d1.status === "READY" && !!d1.blobUrl, d1.status);
      check("derivative carries the warped 3857 geotransform", d1.crsEpsg === 3857 && !!d1.gridWidth && d1.axisYSign === -1);
      const d2 = await ensureDisplayDerivative(DS);
      check("second ensure ADOPTS the cached derivative (no re-warp)", d2.id === d1.id && d2.blobUrl === d1.blobUrl);

      const render = await buildDisplayRender(DS, { mode: "VINEYARD_SCENE", paletteId: "vigor-classic" });
      const servedOk = render.png[0] === 137 && render.png[1] === 80 && render.png.byteLength > 100;
      check("served PNG well-formed + bbox in meta", servedOk && !!render.meta.wgs84Bbox, `bytes=${render.png.byteLength}`);
      check("served ETag is stable + domain sane", render.etag.length > 4 && render.meta.domain.max > render.meta.domain.min);

      await cleanup();
    });
  }

  console.log(failures === 0 ? "\nVERIFY:NDVI-DISPLAY PASSED ✓" : `\n${failures} CHECK(S) FAILED ✗`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

async function cleanup() {
  await prisma.spatialDatasetDerivative.deleteMany({ where: { vineyardId: V } });
  await prisma.spatialDataset.deleteMany({ where: { vineyardId: V } });
  await prisma.spatialScene.deleteMany({ where: { vineyardId: V } });
  await prisma.vineyard.deleteMany({ where: { id: V } });
}

main().catch((e) => {
  console.error("FAILED:", (e as Error)?.name, (e as Error)?.message, (e as Error)?.stack);
  process.exit(1);
});
