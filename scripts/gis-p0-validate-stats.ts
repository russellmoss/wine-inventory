/**
 * P0 Unit 9 — statistics validation. DECISION GATE.
 *
 * Validates the coverage-weighted statistics from `zonal.ts` against `exactextract`, but ONLY the
 * quantities the oracle can legitimately arbitrate: weighted mean, effective pixel count (its
 * `count` IS sum-of-coverage, probed and confirmed), min and max.
 *
 * QUANTILES ARE DELIBERATELY ABSENT. Weighted quantiles are definition-dependent: exactextract has
 * its own generalisation, and Unit 6 pinned the midpoint form after the weighted-type-7 form was
 * shown to ignore its weights entirely. Comparing the two would produce a disagreement that is
 * NOBODY'S BUG and would contaminate the clipper verdict with a definitional difference. Quantiles
 * are pinned by ANALYTIC fixtures in `test/gis-zonal.test.ts` instead. A council requirement,
 * enforced here by simply not asking the oracle the question.
 *
 * Run:  npm run verify:gis-stats
 */
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { coverageOverGrid, type Pt, type PixelGrid } from "../src/lib/gis/coverage";
import { zonalStats, type WeightedSample } from "../src/lib/gis/zonal";
import {
  GRID,
  KNOWN_COVERAGE_PLANTING,
  BLOCK_WEST,
  BLOCK_EAST,
  PLANTING_WITH_HOLE_SHELL,
  PLANTING_WITH_HOLE_HOLE,
  NARROW_BLOCK,
  highVertexBlock,
} from "../test/fixtures/gis/plantings";

type Case = { name: string; parts: Pt[][][]; grid: PixelGrid };

const CASES: Case[] = [
  { name: "known-coverage planting", parts: [[KNOWN_COVERAGE_PLANTING]], grid: GRID },
  { name: "block west", parts: [[BLOCK_WEST]], grid: GRID },
  { name: "block east", parts: [[BLOCK_EAST]], grid: GRID },
  { name: "planting with hole", parts: [[PLANTING_WITH_HOLE_SHELL, PLANTING_WITH_HOLE_HOLE]], grid: GRID },
  { name: "narrow block", parts: [[NARROW_BLOCK]], grid: GRID },
  { name: "high-vertex block (2000)", parts: [[highVertexBlock(2000)]], grid: GRID },
];

/** The gradient, defined identically to the Python side. */
const gradient = (col: number, row: number) => col + 100 * row;

let failures = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => {
  failures++;
  console.log(`  ✗ ${m}`);
};

/** float32 spacing — the oracle's real precision floor, established in Unit 5. */
function float32Ulp(v: number): number {
  const f = new Float32Array(1);
  f[0] = Math.abs(v);
  return Math.max(f[0] * 2 ** -23, 2 ** -149);
}

function main() {
  const dir = mkdtempSync(join(tmpdir(), "gis-p0-stats-"));
  const inPath = join(dir, "in.json");
  const outPath = join(dir, "out.json");

  writeFileSync(
    inPath,
    JSON.stringify({
      cases: CASES.map((c) => ({ name: c.name, parts: c.parts, grid: c.grid, gradient: true })),
    }),
    "utf8",
  );

  const stdout = execFileSync("python3", [join(process.cwd(), "scripts", "gis-p0-exactextract.py"), inPath, outPath], {
    encoding: "utf8",
  });
  console.log(`  ${stdout.trim()}\n`);

  const oracle = JSON.parse(readFileSync(outPath, "utf8")) as {
    version: string;
    cases: {
      name: string;
      aggregates: { mean: number | null; count: number | null; min: number | null; max: number | null };
    }[];
  };

  const rows: string[] = [];
  for (const c of CASES) {
    const cov = coverageOverGrid(c.parts.flat(), c.grid);
    const samples: WeightedSample[] = cov.map((p) => ({ value: gradient(p.col, p.row), weight: p.fraction }));
    const st = zonalStats(samples, { intersectingPixelCount: cov.length, pixelAreaM2: c.grid.pixelSize ** 2 });
    if (!st) {
      bad(`${c.name}: no statistics produced`);
      continue;
    }

    const agg = oracle.cases.find((o) => o.name === c.name)?.aggregates;
    if (!agg || agg.mean === null) {
      bad(`${c.name}: oracle returned no aggregates`);
      continue;
    }

    const cmp = (label: string, mine: number, theirs: number, relTol: number): string => {
      const diff = Math.abs(mine - theirs);
      const rel = Math.abs(theirs) > 0 ? diff / Math.abs(theirs) : diff;
      const budget = Math.max(relTol, float32Ulp(theirs) * 4);
      if (rel > budget) {
        bad(`${c.name} ${label}: ours=${mine} oracle=${theirs} rel=${rel.toExponential(2)} > ${budget.toExponential(2)}`);
        return "FAIL";
      }
      ok(`${c.name} ${label}: rel diff ${rel.toExponential(2)}`);
      return rel.toExponential(2);
    };

    const rMean = cmp("weighted mean", st.mean, agg.mean, 1e-6);
    const rCount = cmp("effective pixel count", st.effectivePixelCount, agg.count as number, 1e-6);
    const rMin = cmp("min", st.min, agg.min as number, 1e-9);
    const rMax = cmp("max", st.max, agg.max as number, 1e-9);
    rows.push(`| ${c.name} | ${rMean} | ${rCount} | ${rMin} | ${rMax} |`);
  }

  const report = [
    "# P0 — statistics validation vs exactextract (DECISION GATE, Unit 9)",
    "",
    `**Date:** 2026-07-24 · **Oracle:** exactextract ${oracle.version}`,
    "**Script:** `scripts/gis-p0-validate-stats.ts` · **Run:** `npm run verify:gis-stats`",
    "",
    "## What the oracle is allowed to arbitrate",
    "",
    "| statistic | validated against | why |",
    "|---|---|---|",
    "| coverage-weighted mean | **exactextract** | one correct answer |",
    "| effective pixel count | **exactextract** | its `count` IS sum-of-coverage (probed and confirmed) |",
    "| min / max | **exactextract** | extremes, unambiguous |",
    "| **p10/p25/median/p75/p90** | **analytic fixtures ONLY** | see below |",
    "",
    "### Why quantiles are excluded, deliberately",
    "",
    "Weighted quantiles are DEFINITION-dependent. exactextract has its own generalisation; Unit 6",
    "pinned the midpoint form after the weighted-type-7 form was shown to ignore its weights entirely",
    "(it returned a median of 50.5 for `[value 1 weight 9, value 100 weight 1]`). Comparing the two",
    "would surface a disagreement that is nobody's bug and would contaminate the clipper verdict with",
    "a definitional difference. Quantiles are therefore pinned by analytic fixtures in",
    "`test/gis-zonal.test.ts`. This separation was a council requirement (Codex) and is enforced by",
    "simply not asking the oracle the question.",
    "",
    "## Results",
    "",
    "The raster is a deterministic gradient `value(col,row) = col + 100*row`, defined identically on",
    "both sides. A constant raster would make a weighted mean trivially equal to the constant and",
    "prove nothing.",
    "",
    "| fixture | weighted mean | effective count | min | max |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    "Tolerances are relative, floored at 4x the oracle's float32 spacing — the precision limit",
    "established in Unit 5, where every exactextract value proved exactly float32-representable.",
    "",
    `## Verdict: ${failures === 0 ? "**PASS**" : "**FAIL**"}`,
    "",
    failures === 0
      ? "The coverage-weighted statistics agree with exactextract on every quantity the oracle can arbitrate."
      : `${failures} assertion(s) failed.`,
  ].join("\n");

  writeFileSync(join(process.cwd(), "docs", "GIS", "phases", "p0-validation-stats.md"), report + "\n", "utf8");
  console.log("\n  report -> docs/GIS/phases/p0-validation-stats.md");
  console.log(failures === 0 ? "\nALL STATISTICS ASSERTIONS PASSED" : `\n${failures} ASSERTION(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
