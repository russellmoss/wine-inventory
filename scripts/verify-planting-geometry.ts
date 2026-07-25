/**
 * verify:planting-geometry — end-to-end proof of Vineyard Intelligence P1 on the Demo Winery sandbox.
 *
 * Exercises the REAL cores through the REAL tenant path (runAsTenant → runInTenantTx → extended prisma
 * under RLS), against the production Neon DB's Demo Winery tenant ONLY. QA-* fixtures, cleaned up after.
 *
 * Proves: create planting (with a hole) → blade-split into shared-edge blocks (zero lost area) →
 * topology reconciles (no overlap/gap) → a 10 cm nudge is CORRECT_IN_PLACE (no new version) → a reshape
 * mints a NEW version with the old one retained (append-only) → migration-by-union links legacy blocks
 * all-or-nothing without mutating their polygons.
 *
 * Run from the MAIN checkout (needs .env): `npm run verify:planting-geometry`.
 */
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { prisma } from "@/lib/prisma";
import type { PolygonGeometry, VineyardPolygon } from "@/lib/gis/geometry";
import { projectedAreaM2 } from "@/lib/gis/geometry-meta";
import {
  createPlantingAreaCore,
  updatePlantingGeometryCore,
  splitIntoBlocksCore,
} from "@/lib/plantingArea/planting-area-core";
import {
  proposePlantingAreasFromBlocksCore,
  confirmProposedPlantingAreasCore,
} from "@/lib/plantingArea/migration-core";

const TENANT = "org_demo_winery";
const LON0 = -78.5;
const LAT0 = 38.03;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓  ${name}${detail ? `  — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

function square(sideDeg: number, ox = 0, oy = 0): PolygonGeometry {
  const x = LON0 + ox;
  const y = LAT0 + oy;
  return { type: "Polygon", coordinates: [[[x, y], [x, y + sideDeg], [x + sideDeg, y + sideDeg], [x + sideDeg, y], [x, y]]] };
}

async function main() {
  const createdVineyardIds: string[] = [];
  const createdPaIds: string[] = [];
  const createdBlockIds: string[] = [];

  await runAsTenant(TENANT, async () => {
    // ---- Fixture vineyards (QA-*) ----
    const vy1 = await prisma.vineyard.create({ data: { name: `QA-PlantGeo-${Date.now()}` } });
    createdVineyardIds.push(vy1.id);

    // ---- 1) Create a planting area with a hole ----
    const outer = square(0.006).coordinates[0];
    const hx = LON0 + 0.002;
    const hy = LAT0 + 0.002;
    const hole = [[hx, hy], [hx + 0.001, hy], [hx + 0.001, hy + 0.001], [hx, hy + 0.001], [hx, hy]];
    const holed: VineyardPolygon = { type: "Polygon", coordinates: [outer, hole] };

    const pa = await runInTenantTx((tx) =>
      createPlantingAreaCore(tx, { vineyardId: vy1.id, name: "QA North", geometry: holed, source: "DRAW", reviewStatus: "CONFIRMED" }),
    );
    createdPaIds.push(pa.id);
    const paRow = await prisma.vineyardPlantingArea.findUnique({ where: { id: pa.id } });
    check("create planting area persists v1 + fingerprint + area", !!paRow && paRow.geometryVersion === 1 && !!paRow.geometryFingerprint && paRow.areaGeodesicM2 != null);
    const v1rows = await prisma.vineyardGeometryVersion.count({ where: { subjectType: "PLANTING_AREA", subjectId: pa.id } });
    check("one opening geometry-version row written", v1rows === 1);

    // ---- 2) Blade-split into two shared-edge blocks ----
    const midLon = LON0 + 0.003;
    const blade = [[midLon, LAT0 + 0.001], [midLon, LAT0 + 0.005]];
    const split = await runInTenantTx((tx) => splitIntoBlocksCore(tx, { plantingAreaId: pa.id, lineCoords: blade }));
    createdBlockIds.push(...split.blockIds);
    check("split produced exactly 2 blocks", split.blockIds.length === 2, `got ${split.blockIds.length}`);
    const blocks = await prisma.vineyardBlock.findMany({ where: { id: { in: split.blockIds } } });
    const blockAreas = blocks.map((b) => projectedAreaM2(b.polygon as unknown as VineyardPolygon));
    const plantingArea = projectedAreaM2(holed);
    const sumBlocks = blockAreas.reduce((a, b) => a + b, 0);
    check("blocks tile the planting (zero lost area)", Math.abs(sumBlocks - plantingArea) / plantingArea < 0.02, `blocks ${sumBlocks.toFixed(0)} vs planting ${plantingArea.toFixed(0)} m²`);
    check("every block linked to the planting + fingerprinted", blocks.every((b) => b.plantingAreaId === pa.id && b.geometryFingerprint));

    // ---- 3) IoU-gated versioning ----
    // 3a) tiny nudge → CORRECT_IN_PLACE (no new version)
    const nudged: VineyardPolygon = JSON.parse(JSON.stringify(paRow!.geometry));
    (nudged.coordinates as number[][][])[0][1][0] += 0.000001; // ~9 cm
    const t1 = await runInTenantTx((tx) => updatePlantingGeometryCore(tx, { plantingAreaId: pa.id, nextGeometry: nudged }));
    const afterNudge = await prisma.vineyardPlantingArea.findUnique({ where: { id: pa.id }, select: { geometryVersion: true } });
    check("10 cm nudge is CORRECT_IN_PLACE, no version bump", t1.transition === "CORRECT_IN_PLACE" && afterNudge!.geometryVersion === 1, `transition=${t1.transition}, v=${afterNudge!.geometryVersion}`);
    check("still exactly one geometry-version row after a correction", (await prisma.vineyardGeometryVersion.count({ where: { subjectType: "PLANTING_AREA", subjectId: pa.id } })) === 1);

    // 3b) real reshape → NEW_VERSION (old retained)
    const reshaped = square(0.006, 0.003, 0); // shifted halfway → ~50% overlap
    const t2 = await runInTenantTx((tx) => updatePlantingGeometryCore(tx, { plantingAreaId: pa.id, nextGeometry: reshaped }));
    const afterReshape = await prisma.vineyardPlantingArea.findUnique({ where: { id: pa.id }, select: { geometryVersion: true } });
    check("reshape mints NEW_VERSION (v2)", t2.transition === "NEW_VERSION" && afterReshape!.geometryVersion === 2, `transition=${t2.transition}, v=${afterReshape!.geometryVersion}`);
    const allVersions = await prisma.vineyardGeometryVersion.findMany({ where: { subjectType: "PLANTING_AREA", subjectId: pa.id }, orderBy: { version: "asc" } });
    const closed = allVersions.filter((v) => v.effectiveTo !== null);
    const open = allVersions.filter((v) => v.effectiveTo === null);
    check("old version retained (append-only): 2 rows, v1 closed, v2 open", allVersions.length === 2 && closed.length === 1 && open.length === 1 && closed[0].version === 1 && open[0].version === 2);

    // ---- 4) Migration-by-union (all-or-nothing) ----
    const vy2 = await prisma.vineyard.create({ data: { name: `QA-Migrate-${Date.now()}` } });
    createdVineyardIds.push(vy2.id);
    // two legacy blocks: A & B share an edge (one continuous planting), C far away (separate planting)
    const legA = await prisma.vineyardBlock.create({ data: { vineyardId: vy2.id, blockLabel: "A", polygon: square(0.002, 0, 0) as object } });
    const legB = await prisma.vineyardBlock.create({ data: { vineyardId: vy2.id, blockLabel: "B", polygon: square(0.002, 0.002, 0) as object } });
    const legC = await prisma.vineyardBlock.create({ data: { vineyardId: vy2.id, blockLabel: "C", polygon: square(0.002, 0.02, 0) as object } });
    createdBlockIds.push(legA.id, legB.id, legC.id);
    const polyBefore = (await prisma.vineyardBlock.findUnique({ where: { id: legA.id }, select: { polygon: true } }))!.polygon;

    const { proposals } = await proposePlantingAreasFromBlocksCore(vy2.id);
    check("migration proposes 2 plantings (A+B continuous, C separate — no road-bridging)", proposals.length === 2, `got ${proposals.length}`);
    const conf = await runInTenantTx((tx) => confirmProposedPlantingAreasCore(tx, { vineyardId: vy2.id, proposals }));
    createdPaIds.push(...conf.createdIds);
    check("confirm creates 2 planting areas + marks migrated (all-or-nothing)", conf.createdIds.length === 2 && conf.migrated);
    const linked = await prisma.vineyardBlock.count({ where: { vineyardId: vy2.id, plantingAreaId: { not: null } } });
    check("all 3 legacy blocks linked to a planting", linked === 3, `linked ${linked}/3`);
    const polyAfter = (await prisma.vineyardBlock.findUnique({ where: { id: legA.id }, select: { polygon: true } }))!.polygon;
    check("source block polygon BYTE-IDENTICAL before/after migration", JSON.stringify(polyBefore) === JSON.stringify(polyAfter));

    // ---- cleanup ----
    await prisma.vineyardGeometryVersion.deleteMany({ where: { subjectId: { in: [...createdPaIds, ...createdBlockIds] } } });
    await prisma.vineyardBlock.deleteMany({ where: { vineyardId: { in: createdVineyardIds } } });
    await prisma.vineyardPlantingArea.deleteMany({ where: { vineyardId: { in: createdVineyardIds } } });
    await prisma.vineyard.deleteMany({ where: { id: { in: createdVineyardIds } } });
  });

  console.log(`\n${failed === 0 ? "ALL PLANTING-GEOMETRY CHECKS PASSED ✓" : `✗ ${failed} CHECK(S) FAILED`}  (${passed} passed)`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
