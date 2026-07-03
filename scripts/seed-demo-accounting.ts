/**
 * Phase 15 — demo data for the QuickBooks sync. Drives the REAL cores (crush → costed SO2 addition →
 * bottle) to produce a genuine BottlingCostSnapshot with FRUIT + MATERIAL cost components to map +
 * sync, plus a named Vendor so the A/P-bill flow is easy to show. Self-contained + idempotent (unique
 * "QBO Demo" ids), so it doesn't collide with a partial seed:demo-scenario. Demo Winery only.
 *
 *   npm run seed:demo-accounting        (FORCE=1 to re-run)
 *
 * The demo itself is then live: Connect QuickBooks → map accounts → the seeded COGS posts; receive a
 * supply from the seeded vendor → an A/P bill posts.
 */
export {}; // module scope — isolates top-level names from the other seed scripts (tsc)
const _t = process.env.SEED_CONNECT_TIMEOUT || "30";
const _b = process.env.DATABASE_URL;
if (_b && !/connect_timeout=/.test(_b)) {
  const sep = _b.includes("?") ? "&" : "?";
  process.env.DATABASE_URL = `${_b}${sep}connect_timeout=${_t}&pool_timeout=${_t}`;
}

const TENANT = "org_demo_winery";
const ACTOR = { actorUserId: null as string | null, actorEmail: "system@seed-demo-qbo" };
const SKU_NAME = "QBO Demo Reserve Cabernet";

async function main() {
  const { prisma, prismaBase } = await import("../src/lib/prisma");
  const { runAsTenant } = await import("../src/lib/tenant/context");
  const { crushLotCore } = await import("../src/lib/transform/crush-core");
  const { executeBottling } = await import("../src/lib/bottling/run");

  await runAsTenant(TENANT, async () => {
    const existing = await prisma.wineSku.findFirst({ where: { name: SKU_NAME } });
    if (existing && process.env.FORCE !== "1") {
      console.log(`Already seeded ("${SKU_NAME}" exists). Set FORCE=1 to add another batch.`);
      return;
    }

    // ---- reference data (reuse where present) ----
    const variety =
      (await prisma.variety.findFirst({ where: { name: "Cabernet Sauvignon" } })) ??
      (await prisma.variety.create({ data: { name: "Cabernet Sauvignon", abbreviation: "CS" } }));
    const warehouse =
      (await prisma.location.findFirst({ where: { name: "Warehouse" } })) ??
      (await prisma.location.create({ data: { name: "Warehouse" } }));
    // Every run uses a unique token so nothing collides (fresh tank avoids "occupied", fresh vineyard
    // avoids the name/abbreviation unique). The SKU guard above still prevents accidental double-seeds.
    const uniq = Date.now().toString(36).slice(-5);
    const suffix = ` ${uniq}`;
    const tank = await prisma.vessel.create({ data: { code: `QBO-T-${uniq}`, type: "TANK", capacityL: 5000 } });

    // ---- vineyard → block → harvest → pick (unique QBO names) ----
    const vy = await prisma.vineyard.create({ data: { name: `QBO Demo Vineyard${suffix}`, abbreviation: `Q${uniq}` } });
    const block = await prisma.vineyardBlock.create({ data: { vineyardId: vy.id, blockLabel: "Block 1 — Cabernet", code: "1", varietyId: variety.id } });
    const rec = await prisma.harvestRecord.create({ data: { blockId: block.id, vineyardId: vy.id, vintageYear: 2024, createdByEmail: ACTOR.actorEmail } });
    const pick = await prisma.harvestPick.create({ data: { harvestRecordId: rec.id, weightKg: 4000, brixAtPick: 25, pickDate: new Date("2024-09-18"), createdByEmail: ACTOR.actorEmail } });

    // ---- crush (FRUIT cost, KNOWN basis) → bottle (a postable COGS snapshot) ----
    // FRUIT-only keeps the basis KNOWN so the snapshot actually POSTS (a PARTIAL basis is withheld,
    // D14). The mapping UI still shows every component; other components map + post the same way.
    const crush = await crushLotCore(ACTOR, {
      commandId: `qbo-demo-crush${suffix}`,
      picks: [{ pickId: pick.id, consumedKg: 4000 }],
      destVesselId: tank.id,
      outputVolumeL: 2900,
      target: { mode: "NEW", vintage: 2024 },
      fruitCostPerKg: 2.75,
    });

    await executeBottling(
      { vesselIds: [tank.id], destinationLocationId: warehouse.id, skuName: SKU_NAME, skuVintage: 2024, bottlesProduced: 380, abv: 14.6, date: new Date("2024-10-22") },
      ACTOR,
    );

    // ---- a named vendor so the A/P-bill demo is one click (receive a supply from them) ----
    const vendorName = "Scott Laboratories";
    if (!(await prisma.vendor.findFirst({ where: { name: vendorName } }))) {
      await prisma.vendor.create({ data: { name: vendorName, terms: "Net 30" } });
    }

    // ---- report ----
    const snap = await prisma.bottlingCostSnapshot.findFirst({ orderBy: { bottledAt: "desc" }, select: { goodBottles: true, costPerBottle: true, componentBreakdown: true, basisCompleteness: true } });
    const comps = Object.entries((snap?.componentBreakdown as Record<string, number>) ?? {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k}=$${Number(v).toFixed(2)}`);
    console.log(`✅ Demo accounting data ready in Demo Winery.`);
    console.log(`   COGS snapshot: ${snap?.goodBottles ?? "?"} bottles @ $${Number(snap?.costPerBottle ?? 0).toFixed(2)}/btl · components: ${comps.join(", ") || "(none)"} · basis ${snap?.basisCompleteness}`);
    console.log(`   Vendor "${vendorName}" ready for the A/P-bill demo.`);
    console.log(`   Next (live): Connect QuickBooks → map FRUIT/MATERIAL accounts → the COGS posts; receive a supply from "${vendorName}" → an A/P bill posts.`);
    await prismaBase.$disconnect();
  });
  process.exit(0);
}

main().catch((e) => {
  console.error("seed-demo-accounting failed:", e);
  process.exit(1);
});
