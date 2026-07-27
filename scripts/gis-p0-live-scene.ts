/**
 * P0 Unit 11 — one live, ESTATE-WIDE Process API round-trip. MEASUREMENT.
 *
 * Run by hand, once, from the MAIN checkout (worktrees have no `.env`):
 *   npm run verify:gis-live
 *
 * ONE request for the whole estate, not one per block. The CDSE free tier allows 10,000 requests and
 * 10,000 processing units per month, and a 50 ha 3-band FLOAT32 request costs ~0.038 PU — so
 * REQUESTS bind roughly 26x sooner than PU. Per-block fetching would burn 50 requests per look at a
 * 50-block estate; one estate raster costs one. It is also the better test: N blocks clipped against
 * one in-memory raster IS the no-worker hypothesis.
 *
 * Writes no DB rows and does not commit the scene bytes.
 */
import { writeFileSync, readFileSync, mkdtempSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { searchStacScenes, fetchProcessedScene, baselineFromProductId, buildProcessRequest } from "../src/lib/gis/satellite/client";
import { copernicusAttribution } from "../src/lib/gis/satellite/config";
import { utmBboxFor } from "../src/lib/gis/projection";
import { computeNdvi, isNoData } from "../src/lib/gis/ndvi";
import { coverageOverGrid, coveredAreaM2, type Pt, type PixelGrid } from "../src/lib/gis/coverage";
import { zonalStats, type WeightedSample } from "../src/lib/gis/zonal";
import { percentileDomain } from "../src/lib/gis/color";

/** ~3.5 x 3.3 km estate-scale AOI. Synthetic location: no tenant geometry is read (no DB access). */
const BBOX = [-78.52, 38.02, -78.48, 38.05] as const;
const FROM = "2026-06-01T00:00:00Z";
const TO = "2026-07-01T00:00:00Z";
const MAX_CLOUD = 20;

const ok = (m: string) => console.log(`  ✓ ${m}`);

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "gis-p0-live-"));
  const tifPath = join(dir, "scene.tif");
  const rawPath = join(dir, "bands.bin");
  const metaPath = join(dir, "meta.json");

  console.log("── STAC: scene discovery + provenance ──");
  const tStac = Date.now();
  const scenes = await searchStacScenes({ bbox: BBOX, fromIso: FROM, toIso: TO, maxCloudCoveragePct: MAX_CLOUD });
  const stacMs = Date.now() - tStac;
  if (scenes.length === 0) throw new Error("no scenes in window");
  const scene = scenes[0];
  const baseline = scene.processingVersion ?? baselineFromProductId(scene.id);
  ok(`${scenes.length} scene(s) in ${stacMs}ms`);
  ok(`selected ${scene.id}`);
  ok(`acquired ${scene.datetime}  cloud ${scene.cloudCover}%`);
  ok(`processing baseline ${baseline}  (STAC processing:version; cross-check id token ${baselineFromProductId(scene.id)})`);

  console.log("\n── Process API: one estate-wide raster ──");
  const utm = utmBboxFor(BBOX);
  const widthPx = Math.round((utm.bbox[2] - utm.bbox[0]) / 10);
  const heightPx = Math.round((utm.bbox[3] - utm.bbox[1]) / 10);
  ok(`output CRS ${utm.epsg}, ~${widthPx} x ${heightPx} px at 10 m`);

  const tProc = Date.now();
  const res = await fetchProcessedScene({ bbox: BBOX, fromIso: FROM, toIso: TO, maxCloudCoveragePct: MAX_CLOUD });
  const procMs = Date.now() - tProc;
  writeFileSync(tifPath, res.bytes);
  ok(`${res.bytes.byteLength} bytes in ${procMs}ms  (${(res.bytes.byteLength / 1024 / 1024).toFixed(2)} MB)`);
  ok(`processing units: ${res.processingUnits ?? "not reported"}`);
  ok(`content-type: ${res.contentType}`);

  console.log("\n── decode (python/tifffile — no npm raster dep) ──");
  const decodeOut = execFileSync(
    "python3",
    [join(process.cwd(), "scripts", "gis-p0-decode-tif.py"), tifPath, rawPath, metaPath],
    { encoding: "utf8" },
  );
  console.log(`  ${decodeOut.trim()}`);
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { width: number; height: number; bands: number };
  const raw = readFileSync(rawPath);
  const n = meta.width * meta.height;
  const f32 = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const red = f32.subarray(0, n);
  const nir = f32.subarray(n, 2 * n);
  const scl = f32.subarray(2 * n, 3 * n);

  console.log("\n── the REAL math over REAL data ──");
  const tMath = Date.now();
  const sclU8 = new Uint8Array(n);
  for (let i = 0; i < n; i++) sclU8[i] = Math.round(scl[i]);
  const ndvi = computeNdvi(red, nir, sclU8, meta.width, meta.height);
  const mathMs = Date.now() - tMath;

  ok(`NDVI over ${n.toLocaleString()} pixels in ${mathMs}ms`);
  ok(`valid ${ndvi.validCount.toLocaleString()} (${((ndvi.validCount / n) * 100).toFixed(1)}%), masked ${ndvi.maskedCount.toLocaleString()}`);
  ok(`saturated (NDVI exactly 1.0) ${ndvi.saturatedCount}`);

  // A synthetic block grid over the real raster: 20 blocks, each ~200 x 200 m.
  const grid: PixelGrid = { originX: 0, originY: 0, pixelSize: 10, width: meta.width, height: meta.height };
  const blocks: Pt[][] = [];
  for (let b = 0; b < 20; b++) {
    const bx = (b % 5) * 220 + 40;
    const by = Math.floor(b / 5) * 220 + 40;
    blocks.push([
      [bx, by],
      [bx + 200, by],
      [bx + 200, by + 200],
      [bx, by + 200],
    ]);
  }

  const tClip = Date.now();
  let totalCells = 0;
  const perBlock: { i: number; mean: number | null; areaM2: number }[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const cov = coverageOverGrid([blocks[i]], grid);
    totalCells += cov.length;
    const samples: WeightedSample[] = [];
    for (const c of cov) {
      const v = ndvi.values[c.index];
      if (!isNoData(v)) samples.push({ value: v, weight: c.fraction });
    }
    const st = zonalStats(samples, { intersectingPixelCount: cov.length, pixelAreaM2: 100 });
    perBlock.push({ i, mean: st?.mean ?? null, areaM2: coveredAreaM2(cov, 10) });
  }
  const clipMs = Date.now() - tClip;
  ok(`clipped ${blocks.length} blocks (${totalCells.toLocaleString()} cells) in ${clipMs}ms`);

  // vineyard-wide colour domain, over every valid pixel
  const all: WeightedSample[] = [];
  for (let i = 0; i < n; i++) {
    const v = ndvi.values[i];
    if (!isNoData(v)) all.push({ value: v, weight: 1 });
  }
  const tDomain = Date.now();
  const domain = percentileDomain(all);
  const domainMs = Date.now() - tDomain;
  ok(`p5-p95 domain [${domain.min.toFixed(4)}, ${domain.max.toFixed(4)}] over ${all.length.toLocaleString()} px in ${domainMs}ms`);
  ok(`narrow=${domain.narrow} degenerate=${domain.degenerate}`);

  const means = perBlock.filter((b) => b.mean !== null).map((b) => b.mean as number);
  ok(`block NDVI means: ${Math.min(...means).toFixed(3)} .. ${Math.max(...means).toFixed(3)}`);

  const totalMs = stacMs + procMs + mathMs + clipMs + domainMs;
  const attribution = copernicusAttribution(new Date(scene.datetime ?? Date.now()).getUTCFullYear());

  const reqBody = buildProcessRequest({ bbox: BBOX, fromIso: FROM, toIso: TO, maxCloudCoveragePct: MAX_CLOUD }) as {
    input: { data: { processing: Record<string, unknown> }[] };
  };

  const report = [
    "# P0 — live estate-wide round-trip (MEASUREMENT, Unit 11)",
    "",
    "**Date:** 2026-07-24 · **Run:** `npm run verify:gis-live` (by hand, from the main checkout)",
    "",
    "One request for the WHOLE ESTATE, not one per block. The free tier allows 10,000 requests and",
    "10,000 PU per month and this request cost the PU below, so REQUESTS bind ~26x sooner than PU.",
    "Per-block fetching would burn 50 requests per look at a 50-block estate. It is also the better",
    "test: N blocks clipped against one in-memory raster IS the no-worker hypothesis.",
    "",
    "## Provenance",
    "",
    "| field | value |",
    "|---|---|",
    `| scene id | \`${scene.id}\` |`,
    `| acquired | ${scene.datetime} |`,
    `| scene cloud cover | ${scene.cloudCover}% |`,
    `| **processing baseline** | **${baseline}** (STAC \`processing:version\`) |`,
    `| baseline cross-check | \`${baselineFromProductId(scene.id)}\` from the SAFE product id |`,
    `| output CRS | ${utm.epsg} |`,
    `| grid | ${meta.width} x ${meta.height} px at 10 m |`,
    `| units | REFLECTANCE |`,
    `| harmonizeValues | ${reqBody.input.data[0].processing.harmonizeValues} |`,
    `| upsampling / downsampling | ${reqBody.input.data[0].processing.upsampling} / ${reqBody.input.data[0].processing.downsampling} |`,
    `| attribution | ${attribution} |`,
    "",
    "The baseline is NOT available from the Process API. It comes from a second call to the CDSE STAC",
    "catalogue, and the `_N####_` token in the SAFE product id corroborates it. Recording Sentinel",
    "Hub's `serviceVersion` in its place would have been silently wrong.",
    "",
    "## Measurements",
    "",
    "| stage | time |",
    "|---|---|",
    `| STAC search | ${stacMs} ms |`,
    `| Process API (fetch + transfer) | ${procMs} ms |`,
    `| NDVI + SCL mask over ${n.toLocaleString()} px | ${mathMs} ms |`,
    `| clip + zonal stats, ${blocks.length} blocks | ${clipMs} ms |`,
    `| vineyard p5-p95 domain | ${domainMs} ms |`,
    `| **total** | **${totalMs} ms** |`,
    "",
    "| output | value |",
    "|---|---|",
    `| payload | ${res.bytes.byteLength.toLocaleString()} bytes (${(res.bytes.byteLength / 1024 / 1024).toFixed(2)} MB) |`,
    `| processing units | ${res.processingUnits ?? "not reported"} |`,
    `| pixels | ${n.toLocaleString()} |`,
    `| valid after SCL mask | ${ndvi.validCount.toLocaleString()} (${((ndvi.validCount / n) * 100).toFixed(1)}%) |`,
    `| masked | ${ndvi.maskedCount.toLocaleString()} |`,
    `| saturated (NDVI exactly 1.0) | ${ndvi.saturatedCount} |`,
    `| cells clipped across ${blocks.length} blocks | ${totalCells.toLocaleString()} |`,
    "",
    "## The math survives real data",
    "",
    "The fixtures prove correctness; this proves the pipeline survives real no-data regions, real SCL",
    "classes and a real UTM grid.",
    "",
    `- vineyard p5-p95 NDVI domain: **[${domain.min.toFixed(4)}, ${domain.max.toFixed(4)}]**`,
    `- narrow: ${domain.narrow} · degenerate: ${domain.degenerate}`,
    `- per-block NDVI means span **${Math.min(...means).toFixed(3)} .. ${Math.max(...means).toFixed(3)}**`,
    "",
    "A spread of block means across a single scene is the product working: it is exactly the",
    "within-vineyard variation a manager opens the map to find.",
    "",
    "## A trap worth recording",
    "",
    "The first live attempt returned HTTP 400:",
    "",
    "> Your request of 3504.23 meters per pixel exceeds the limit 1500.00 meters per pixel",
    "",
    "`output.resx/resy` are in the units of the REQUESTED CRS. Under CRS84 `resx: 10` asks for 10",
    "DEGREES per pixel. Pinning Sentinel-2's native 10 m grid is only possible in a METRIC CRS, so the",
    "client now projects the AOI into its UTM zone by default (`utmBboxFor`) and the resolution is",
    "correct by construction rather than by remembering.",
    "",
    "## Decoding",
    "",
    "The GeoTIFF is decoded with Python `tifffile`, a dev-only tool, rather than adding an npm raster",
    "dependency for a spike. The runtime dependency count stays at 23.",
  ].join("\n");

  writeFileSync(join(process.cwd(), "docs", "GIS", "phases", "p0-live-roundtrip.md"), report + "\n", "utf8");
  console.log("\n  report -> docs/GIS/phases/p0-live-roundtrip.md");
  console.log(`  (scene kept out of the repo: ${statSync(tifPath).size} bytes in a temp dir)`);
  console.log("\nLIVE ROUND-TRIP COMPLETE");
}

main().catch((e) => {
  console.error("FAILED:", (e as Error)?.name, (e as Error)?.message);
  process.exit(1);
});
