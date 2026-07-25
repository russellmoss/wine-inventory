/**
 * P2 Unit 2 — generate the committed GeoTIFF decode fixture (run by hand, ONCE, from the main checkout).
 *
 *   npx tsx --env-file=.env scripts/gis-p2-make-fixture.ts
 *
 * Fetches ONE small real CDSE scene over a tiny AOI, commits the raw FLOAT32 GeoTIFF, and derives the
 * reference band arrays with the SAME Python `tifffile` path P0 used (scripts/gis-p0-decode-tif.py) — an
 * oracle independent of geotiff.js. The georeference oracle is the REQUEST itself (utmBboxFor), also
 * independent of the decoder. `test/gis-decode.test.ts` then asserts the JS decoder reproduces both.
 *
 * Copernicus Sentinel-2 data is free and open; the tiny derived fixture carries the attribution string.
 * Node `fetch`, never curl (curl fails CDSE TLS on this Windows box).
 */
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { searchStacScenes, fetchProcessedScene, baselineFromProductId } from "../src/lib/gis/satellite/client";
import { copernicusAttribution } from "../src/lib/gis/satellite/config";
import { utmBboxFor } from "../src/lib/gis/projection";

// A tiny (~0.6 × 0.65 km) AOI inside the P0 Virginia estate box → ~60×72 px → a few tens of KB.
const BBOX = [-78.52, 38.02, -78.5135, 38.0258] as const;
const FROM = "2026-06-01T00:00:00Z";
const TO = "2026-07-15T00:00:00Z";
const MAX_CLOUD = 20;

const FIX_DIR = join(process.cwd(), "test", "fixtures", "gis");

async function main() {
  console.log("── STAC search ──");
  const scenes = await searchStacScenes({ bbox: BBOX, fromIso: FROM, toIso: TO, maxCloudCoveragePct: MAX_CLOUD });
  if (scenes.length === 0) throw new Error("no scenes in window — widen the date range");
  const scene = scenes[0];
  const baseline = scene.processingVersion ?? baselineFromProductId(scene.id);
  console.log(`  selected ${scene.id}  acquired ${scene.datetime}  cloud ${scene.cloudCover}%  baseline ${baseline}`);

  console.log("── Process API fetch ──");
  const res = await fetchProcessedScene({ bbox: BBOX, fromIso: FROM, toIso: TO, maxCloudCoveragePct: MAX_CLOUD });
  const tifPath = join(FIX_DIR, "ndvi-scene.tif");
  writeFileSync(tifPath, res.bytes);
  console.log(`  ${res.bytes.byteLength} bytes → ${tifPath}  (PU ${res.processingUnits ?? "n/a"})`);

  console.log("── Python tifffile reference (independent band oracle) ──");
  const dir = mkdtempSync(join(tmpdir(), "gis-p2-fix-"));
  const rawPath = join(dir, "bands.bin");
  const metaPath = join(dir, "meta.json");
  const py = execFileSync("python3", [join(process.cwd(), "scripts", "gis-p0-decode-tif.py"), tifPath, rawPath, metaPath], { encoding: "utf8" });
  console.log(`  ${py.trim()}`);
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { width: number; height: number; bands: number };
  const raw = readFileSync(rawPath);
  // Commit the reference bands as base64 in a JSON so CI needs no Python. Round-trip through Float32 view.
  const f32 = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const n = meta.width * meta.height;
  const bandB64 = (start: number) => Buffer.from(new Float32Array(f32.subarray(start, start + n)).buffer).toString("base64");

  const utm = utmBboxFor(BBOX);
  const reference = {
    provenance: {
      sceneId: scene.id,
      acquiredAt: scene.datetime,
      sceneCloudCover: scene.cloudCover,
      processingBaseline: baseline,
      attribution: copernicusAttribution(new Date(scene.datetime ?? Date.now()).getUTCFullYear()),
      generatedFrom: "scripts/gis-p2-make-fixture.ts",
      byteSize: res.bytes.byteLength,
    },
    // Band-value oracle (Python tifffile), row-major, row 0 = north.
    width: meta.width,
    height: meta.height,
    bands: meta.bands,
    red: bandB64(0),
    nir: bandB64(n),
    scl: bandB64(2 * n),
    // Georeference oracle, derived from the REQUEST (independent of geotiff.js).
    georef: {
      crsEpsg: Number(utm.epsg.replace("EPSG:", "")), // numeric, matches the decoder's geokey read
      pixelSizeM: 10,
      axisYSign: -1,
      requestUtmBbox: utm.bbox, // [minX, minY, maxX, maxY]
    },
  };
  const refPath = join(FIX_DIR, "ndvi-scene-reference.json");
  writeFileSync(refPath, JSON.stringify(reference, null, 2) + "\n", "utf8");
  console.log(`  reference → ${refPath}  (${meta.width}×${meta.height}, epsg ${utm.epsg})`);
  console.log("\nFIXTURE WRITTEN. Commit ndvi-scene.tif + ndvi-scene-reference.json.");
}

main().catch((e) => {
  console.error("FAILED:", (e as Error)?.name, (e as Error)?.message);
  process.exit(1);
});
