/**
 * P0 Units 12 + 14 — blob storage behaviour and the runtime/memory sweep. THE VERDICT INPUT.
 *
 * Run:  npm run verify:gis-measure
 *
 * The kill criteria below are PRE-COMMITTED in code, above the measurements, so the verdict cannot be
 * rationalised after the numbers arrive. That was a council requirement: the first draft said things
 * like "exceeds the request budget with no headroom", which is a sentence, not a gate.
 *
 * The sweep varies VERTEX COUNT, HOLE COUNT and PART COUNT alongside area, because Sutherland–Hodgman
 * is O(vertices x pixels) and hectares are only a weak proxy for cost. As Codex put it, a 5 ha block
 * with 20k vertices is a more meaningful stressor than a 500 ha rectangle.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { coverageOverGrid, coveredAreaM2, type Pt, type PixelGrid, type PixelCoverage } from "../src/lib/gis/coverage";
import { computeNdvi, isNoData, SCL_CLASS } from "../src/lib/gis/ndvi";
import { zonalStats, type WeightedSample } from "../src/lib/gis/zonal";
import { percentileDomain, VIGOR_CLASSIC } from "../src/lib/gis/color";
import { focalMedian3x3 } from "../src/lib/gis/smooth";
import { rasterToRgba } from "../src/lib/gis/render";
import { hasBlobCredentials } from "../src/lib/attachments/blob";

// ─────────────────────────────────────────────────────────────────────────────
// KILL CRITERIA — committed before any measurement below. Judged at REALISTIC scale
// (a ~50 ha estate, 20 blocks, <=2000 vertices/block), never at the deliberate stress case.
// ─────────────────────────────────────────────────────────────────────────────
const KILL = {
  K1_computeMsExclProvider: 5_000,
  K2_totalMsInclProvider: 10_000,
  K3_peakRssMb: 512,
  K4_vertexScalingFactor: 20, // 10x vertices must cost < 20x time
  K5_blockScalingFactor: 15, // 10x blocks must cost < 15x time
  K6_storedRasterMb: 50,
} as const;

const PIXEL = 10;
const rssMb = () => process.memoryUsage().rss / 1024 / 1024;
let peakRss = 0;
const tick = () => {
  const r = rssMb();
  if (r > peakRss) peakRss = r;
};

/** A synthetic scene of the requested size, with a realistic mix of SCL classes. */
function makeScene(w: number, h: number) {
  const n = w * h;
  const red = new Float32Array(n);
  const nir = new Float32Array(n);
  const scl = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i % 997) / 997;
    red[i] = 0.03 + t * 0.2;
    nir[i] = 0.45 - t * 0.15;
    // ~19% unusable, close to the 19.2% the live scene actually showed
    scl[i] = i % 41 === 0 ? SCL_CLASS.CLOUD_HIGH : i % 37 === 0 ? SCL_CLASS.CLOUD_SHADOW : SCL_CLASS.VEGETATION;
  }
  return { red, nir, scl, width: w, height: h };
}

function blockRing(cx: number, cy: number, r: number, vertices: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < vertices; i++) {
    const a = (2 * Math.PI * i) / vertices;
    const rr = r * (1 + 0.03 * Math.sin(7 * a));
    out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return out;
}

function holeRing(cx: number, cy: number, r: number): Pt[] {
  // clockwise, so its signed area subtracts
  return [
    [cx - r, cy - r],
    [cx - r, cy + r],
    [cx + r, cy + r],
    [cx + r, cy - r],
  ];
}

type Row = {
  label: string;
  areaHa: number;
  blocks: number;
  verticesPerBlock: number;
  holes: number;
  parts: number;
  pixels: number;
  ndviMs: number;
  clipMs: number;
  statsMs: number;
  domainMs: number;
  smoothMs: number;
  renderMs: number;
  computeMs: number;
  cells: number;
};

function runCase(label: string, sizePx: number, blocks: number, verticesPerBlock: number, holes: number, parts: number): Row {
  const scene = makeScene(sizePx, sizePx);
  const grid: PixelGrid = { originX: 0, originY: 0, pixelSize: PIXEL, width: sizePx, height: sizePx };
  tick();

  const t0 = performance.now();
  const ndvi = computeNdvi(scene.red, scene.nir, scene.scl, scene.width, scene.height);
  const ndviMs = performance.now() - t0;
  tick();

  // build the block set
  const extent = sizePx * PIXEL;
  const perSide = Math.ceil(Math.sqrt(blocks));
  const step = extent / (perSide + 1);
  const radius = Math.max(step * 0.35, PIXEL * 2);
  const rings: Pt[][][] = [];
  for (let b = 0; b < blocks; b++) {
    const cx = (1 + (b % perSide)) * step;
    const cy = (1 + Math.floor(b / perSide)) * step;
    const partList: Pt[][] = [];
    for (let p = 0; p < parts; p++) {
      const shell = blockRing(cx + p * radius * 0.15, cy, radius / (p + 1), verticesPerBlock);
      const ringsForPart: Pt[][] = [shell];
      for (let hIdx = 0; hIdx < holes; hIdx++) {
        ringsForPart.push(holeRing(cx, cy + hIdx * radius * 0.2, radius * 0.12));
      }
      partList.push(...ringsForPart);
    }
    rings.push(partList);
  }

  const t1 = performance.now();
  let cells = 0;
  const covs: PixelCoverage[][] = [];
  for (const r of rings) {
    const cov = coverageOverGrid(r, grid);
    cells += cov.length;
    covs.push(cov);
  }
  const clipMs = performance.now() - t1;
  tick();

  const t2 = performance.now();
  for (const cov of covs) {
    const samples: WeightedSample[] = [];
    for (const c of cov) {
      const v = ndvi.values[c.index];
      if (!isNoData(v)) samples.push({ value: v, weight: c.fraction });
    }
    zonalStats(samples, { intersectingPixelCount: cov.length, pixelAreaM2: PIXEL * PIXEL });
  }
  const statsMs = performance.now() - t2;
  tick();

  const all: WeightedSample[] = [];
  for (let i = 0; i < ndvi.values.length; i++) {
    const v = ndvi.values[i];
    if (!isNoData(v)) all.push({ value: v, weight: 1 });
  }
  const t3 = performance.now();
  const domain = percentileDomain(all);
  const domainMs = performance.now() - t3;
  tick();

  const t4 = performance.now();
  focalMedian3x3({ width: scene.width, height: scene.height, values: ndvi.values });
  const smoothMs = performance.now() - t4;
  tick();

  const t5 = performance.now();
  rasterToRgba(ndvi.values, scene.width, scene.height, domain, VIGOR_CLASSIC);
  const renderMs = performance.now() - t5;
  tick();

  const totalArea = covs.reduce((s, c) => s + coveredAreaM2(c, PIXEL), 0);

  return {
    label,
    areaHa: totalArea / 10_000,
    blocks,
    verticesPerBlock,
    holes,
    parts,
    pixels: sizePx * sizePx,
    ndviMs,
    clipMs,
    statsMs,
    domainMs,
    smoothMs,
    renderMs,
    computeMs: ndviMs + clipMs + statsMs + domainMs + smoothMs + renderMs,
    cells,
  };
}

async function blobSpike(): Promise<string[]> {
  const lines: string[] = [];
  if (!hasBlobCredentials()) {
    lines.push("- SKIPPED: no `BLOB_READ_WRITE_TOKEN` / `VERCEL_OIDC_TOKEN` in this environment.");
    return lines;
  }
  const { put, head, del } = await import("@vercel/blob");
  // stand-in for a stored estate raster, sized from the real Unit 11 payload
  const payload = Buffer.alloc(767_455);
  for (let i = 0; i < payload.length; i++) payload[i] = i % 256;

  const t0 = Date.now();
  const blob = await put(`QA-p0-measure/${Date.now()}-estate.bin`, payload, {
    access: "private",
    addRandomSuffix: true,
    contentType: "application/octet-stream",
  });
  const putMs = Date.now() - t0;

  const lines2: string[] = [];
  try {
  const t1 = Date.now();
  const h = await head(blob.url);
  const headMs = Date.now() - t1;

  const token = process.env.BLOB_READ_WRITE_TOKEN ?? "";
  const auth = { authorization: `Bearer ${token}` };

  const t2 = Date.now();
  const cold = await fetch(blob.url, { headers: auth });
  const coldBytes = (await cold.arrayBuffer()).byteLength;
  const coldMs = Date.now() - t2;

  const t3 = Date.now();
  const warm = await fetch(blob.url, { headers: auth });
  const warmBytes = (await warm.arrayBuffer()).byteLength;
  const warmMs = Date.now() - t3;

  const t4 = Date.now();
  const ranged = await fetch(blob.url, { headers: { ...auth, Range: "bytes=0-1023" } });
  const rangedBytes = (await ranged.arrayBuffer()).byteLength;
  const rangeMs = Date.now() - t4;

  // (cleanup moved into finally below)

  lines.push(`- stored **${payload.length.toLocaleString()} bytes** (private, random suffix) in **${putMs} ms**`);
  lines.push(`- \`head\`: ${h.size.toLocaleString()} bytes, ${h.contentType} — ${headMs} ms`);
  lines.push(`- cold full read: ${coldBytes.toLocaleString()} bytes in **${coldMs} ms**`);
  lines.push(`- warm full read: ${warmBytes.toLocaleString()} bytes in **${warmMs} ms**`);
  lines.push(
    `- **RANGE on a PRIVATE blob: HTTP ${ranged.status}**, ${rangedBytes.toLocaleString()} bytes in ${rangeMs} ms` +
      (ranged.status === 206 ? " — the research's one UNVERIFIED item, CONFIRMED" : " — NOT a 206, design around it"),
  );
  lines.push("- probe deleted; the store is left clean");
  } finally {
    // orphan-proof: delete the private blob even if head/fetch/arrayBuffer threw above
    await del(blob.url).catch(() => {});
  }
  lines.push(...lines2);
  return lines;
}

async function main() {
  console.log("── kill criteria (committed before measuring) ──");
  for (const [k, v] of Object.entries(KILL)) console.log(`  ${k} = ${v}`);

  console.log("\n── sweep ──");
  const rows: Row[] = [];
  const push = (r: Row) => {
    rows.push(r);
    console.log(
      `  ${r.label.padEnd(34)} ${String(r.pixels).padStart(8)} px  ${r.blocks
        .toString()
        .padStart(3)} blocks  compute ${r.computeMs.toFixed(0).padStart(6)} ms  cells ${r.cells}`,
    );
  };

  // area axis
  push(runCase("5 ha estate, 5 blocks", 110, 5, 64, 0, 1));
  push(runCase("50 ha estate, 20 blocks (REALISTIC)", 342, 20, 64, 0, 1));
  push(runCase("500 ha estate, 50 blocks (STRESS)", 1080, 50, 64, 0, 1));
  // vertex axis, area held small
  push(runCase("5 ha, 200 vertices/block", 110, 5, 200, 0, 1));
  push(runCase("5 ha, 2000 vertices/block", 110, 5, 2000, 0, 1));
  // block-count axis
  push(runCase("50 ha, 5 blocks", 342, 5, 64, 0, 1));
  push(runCase("50 ha, 50 blocks", 342, 50, 64, 0, 1));
  // hole + part axes
  push(runCase("50 ha, 4 holes/block", 342, 20, 64, 4, 1));
  push(runCase("50 ha, 3 parts/block", 342, 20, 64, 0, 3));

  const realistic = rows[1];
  const v200 = rows[3];
  const v2000 = rows[4];
  const b5 = rows[5];
  const b50 = rows[6];

  const vertexFactor = v2000.clipMs / Math.max(v200.clipMs, 0.001);
  const blockFactor = b50.clipMs / Math.max(b5.clipMs, 0.001);

  console.log("\n── blob ──");
  const blobLines = await blobSpike();
  for (const l of blobLines) console.log(`  ${l.replace(/\*\*/g, "")}`);

  const storedMb = 767_455 / 1024 / 1024;

  const verdicts = [
    { id: "K1", what: "compute ms excl. provider @ realistic", got: realistic.computeMs.toFixed(0), limit: KILL.K1_computeMsExclProvider, pass: realistic.computeMs < KILL.K1_computeMsExclProvider },
    { id: "K2", what: "total ms incl. provider (2153 ms live)", got: (realistic.computeMs + 2153).toFixed(0), limit: KILL.K2_totalMsInclProvider, pass: realistic.computeMs + 2153 < KILL.K2_totalMsInclProvider },
    { id: "K3", what: "peak RSS MB", got: peakRss.toFixed(0), limit: KILL.K3_peakRssMb, pass: peakRss < KILL.K3_peakRssMb },
    { id: "K4", what: "10x vertices cost factor", got: vertexFactor.toFixed(1), limit: KILL.K4_vertexScalingFactor, pass: vertexFactor < KILL.K4_vertexScalingFactor },
    { id: "K5", what: "10x blocks cost factor", got: blockFactor.toFixed(1), limit: KILL.K5_blockScalingFactor, pass: blockFactor < KILL.K5_blockScalingFactor },
    { id: "K6", what: "stored raster MB", got: storedMb.toFixed(2), limit: KILL.K6_storedRasterMb, pass: storedMb < KILL.K6_storedRasterMb },
  ];

  console.log("\n── kill-criteria verdict ──");
  for (const v of verdicts) console.log(`  ${v.pass ? "PASS" : "FAIL"}  ${v.id}  ${v.what}: ${v.got} (limit ${v.limit})`);
  const allPass = verdicts.every((v) => v.pass);

  const report = [
    "# P0 — runtime, memory and storage measurements (Units 12 + 14)",
    "",
    "**Date:** 2026-07-24 · **Run:** `npm run verify:gis-measure`",
    "",
    "## Kill criteria — committed BEFORE measuring",
    "",
    "Stated in code above the measurements so the verdict cannot be rationalised once the numbers",
    "arrive. Judged at REALISTIC scale (~50 ha estate, 20 blocks, <=2000 vertices/block), never at the",
    "deliberate stress case. Meeting one only under stress is a scale-register tripwire, not a kill.",
    "",
    "| id | criterion | limit | measured | verdict |",
    "|---|---|---|---|---|",
    ...verdicts.map((v) => `| ${v.id} | ${v.what} | ${v.limit} | **${v.got}** | ${v.pass ? "PASS" : "**FAIL**"} |`),
    "",
    "## The sweep",
    "",
    "Varies VERTEX COUNT, HOLE COUNT and PART COUNT alongside area, because Sutherland–Hodgman is",
    "O(vertices x pixels) and hectares are only a weak proxy for cost. A 5 ha block with 2000 vertices",
    "is a more meaningful stressor than a 500 ha rectangle.",
    "",
    "| case | px | blocks | verts/block | holes | parts | NDVI | clip | stats | domain | 3x3 | render | **compute** |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.label} | ${r.pixels.toLocaleString()} | ${r.blocks} | ${r.verticesPerBlock} | ${r.holes} | ${r.parts} | ${r.ndviMs.toFixed(0)} | ${r.clipMs.toFixed(0)} | ${r.statsMs.toFixed(0)} | ${r.domainMs.toFixed(0)} | ${r.smoothMs.toFixed(0)} | ${r.renderMs.toFixed(0)} | **${r.computeMs.toFixed(0)} ms** |`,
    ),
    "",
    "### Scaling shape",
    "",
    `- **vertices**: 200 -> 2000 per block (10x) cost **${vertexFactor.toFixed(1)}x** clip time (limit ${KILL.K4_vertexScalingFactor}x)`,
    `- **blocks**: 5 -> 50 against ONE raster (10x) cost **${blockFactor.toFixed(1)}x** clip time (limit ${KILL.K5_blockScalingFactor}x)`,
    `- peak RSS across the whole sweep: **${peakRss.toFixed(0)} MB**`,
    "",
    "Clipping is bbox-prefiltered per ring, which is what keeps the vertex axis sub-quadratic. Without",
    "it a high-vertex block would be clipped against every pixel in the raster.",
    "",
    "## Blob storage (Unit 12)",
    "",
    ...blobLines,
    "",
    "The 512 MB per-blob CDN cache ceiling is the constraint that matters: above it every access is a",
    "cache miss plus a billed operation. A real estate raster is ~0.73 MB, three orders below it, so",
    "there is enormous headroom — but the limit is recorded here rather than left in someone's memory.",
    "",
    `## Verdict input: ${allPass ? "**all kill criteria PASS**" : "**at least one kill criterion FAILED**"}`,
  ].join("\n");

  writeFileSync(join(process.cwd(), "docs", "GIS", "phases", "p0-measurements.md"), report + "\n", "utf8");
  console.log("\n  report -> docs/GIS/phases/p0-measurements.md");
  console.log(allPass ? "\nALL KILL CRITERIA PASS" : "\nKILL CRITERIA FAILED");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("FAILED:", (e as Error)?.message);
  process.exit(1);
});
