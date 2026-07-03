/**
 * Rich demo scenario for the "Demo Winery" tenant — drives the REAL operation cores so the
 * ledger, projections, cost roll-up, and TTB 5120.17 / 5000.24 all derive correctly.
 *
 * Builds: real-coordinate vineyards + fake blocks · harvest picks (some left UNPROCESSED) ·
 * crush → MUST lots · daily ferment Brix/temp · pH/TA/ABV analyses (tank + barrel) ·
 * costed SO2/bentonite additions · a press · a blend in tank · a bottling to the warehouse ·
 * bond→taxpaid removals across tax classes · then generates + prints the 5120 and 5000.
 *
 * Run AFTER Phase-8a migrations are deployed:  npm run seed:demo-scenario
 * Idempotent guard: exits if already seeded (FORCE=1 to re-run against a fresh tenant).
 * Slow-link hardening (airplane wifi / cold Neon): widened connect timeout + retry (as seed:demo-tenant).
 */
export {}; // module scope (tsc isolation)
const _t = process.env.SEED_CONNECT_TIMEOUT || "30";
const _b = process.env.DATABASE_URL;
if (_b && !/connect_timeout=/.test(_b)) {
  const sep = _b.includes("?") ? "&" : "?";
  process.env.DATABASE_URL = `${_b}${sep}connect_timeout=${_t}&pool_timeout=${_t}`;
}

const TENANT = "org_demo_winery";
const ACTOR = { actorUserId: null as string | null, actorEmail: "system@seed-demo" };

// A small square GeoJSON polygon around a point (fake block on a real vineyard).
function squareAround(lat: number, lng: number, d = 0.0015) {
  return {
    type: "Polygon",
    coordinates: [[
      [lng - d, lat - d],
      [lng + d, lat - d],
      [lng + d, lat + d],
      [lng - d, lat + d],
      [lng - d, lat - d],
    ]],
  };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { crushLotCore } = await import("../src/lib/transform/crush-core");
  const { pressLotCore } = await import("../src/lib/transform/press-core");
  const { blendLotsCore } = await import("../src/lib/blend/blend-core");
  const { addAdditionCore } = await import("../src/lib/cellar/addition");
  const { recordMeasurementsCore } = await import("../src/lib/chemistry/measurements");
  const { submitPanelCore } = await import("../src/lib/ferment/panel-core");
  const { executeBottling } = await import("../src/lib/bottling/run");
  const { removeTaxpaidCore } = await import("../src/lib/compliance/removal-core");
  const { generateReport } = await import("../src/lib/compliance/generate");
  const { generateExciseReturn } = await import("../src/lib/compliance/generate-excise");

  // ---- idempotency guard ----------------------------------------------------
  const already = await prisma.vineyard.findFirst({ where: { name: "Oakville Estate" } });
  if (already && process.env.FORCE !== "1") {
    console.log("Scenario already seeded (Oakville Estate exists). Set FORCE=1 to re-run on a fresh tenant.");
    return;
  }
  if (already && process.env.FORCE === "1") {
    // Wipe prior vineyard/harvest scenario data (tenant-scoped via RLS; FK-safe order).
    // NOTE: does not remove lots/ops from a run that got past crush — if that happens,
    // recreate the tenant. For the common partial (pre-crush) this is enough.
    console.log("FORCE=1: wiping prior scenario vineyard/harvest data…");
    await prisma.harvestPick.deleteMany({});
    await prisma.harvestRecord.deleteMany({});
    await prisma.vineyardBlock.deleteMany({});
    await prisma.vineyardDetail.deleteMany({});
    await prisma.vineyard.deleteMany({});
  }

  // ---- reference data (reuse seed:demo-tenant rows where present) ------------
  const ensureVariety = async (name: string, abbreviation: string) =>
    (await prisma.variety.findFirst({ where: { name } })) ??
    (await prisma.variety.create({ data: { name, abbreviation } }));
  const ensureLocation = async (name: string) =>
    (await prisma.location.findFirst({ where: { name } })) ??
    (await prisma.location.create({ data: { name } }));
  const ensureVessel = async (code: string, type: "TANK" | "BARREL", capacityL: number) =>
    (await prisma.vessel.findFirst({ where: { code, type } })) ??
    (await prisma.vessel.create({ data: { code, type, capacityL } }));

  const cab = await ensureVariety("Cabernet Sauvignon", "CS");
  const pinot = await ensureVariety("Pinot Noir", "PN");
  const chard = await ensureVariety("Chardonnay", "CH");
  const warehouse = await ensureLocation("Warehouse");

  const tankCab = await ensureVessel("T3", "TANK", 12000);
  const tankPinot = await ensureVessel("T4", "TANK", 10000);
  const tankFreeRun = await ensureVessel("T5", "TANK", 12000);
  const tankBlend = await ensureVessel("T6", "TANK", 8000);
  const tankFort = await ensureVessel("T7", "TANK", 2000);
  const barrelPress = await ensureVessel("B4", "BARREL", 225);

  // ---- vineyards (real coords) + fake blocks --------------------------------
  // Create vineyard + its detail as SEPARATE top-level creates — nested `detail: { create }`
  // doesn't get tenantId auto-injected (extension injects top-level only) → RLS rejects it.
  const mkVineyard = async (name: string, abbreviation: string, gpsLat: number, gpsLng: number) => {
    const v = await prisma.vineyard.create({ data: { name, abbreviation } });
    await prisma.vineyardDetail.create({ data: { vineyardId: v.id, gpsLat, gpsLng } });
    return v;
  };
  const oakville = await mkVineyard("Oakville Estate", "OAK", 38.4386, -122.4097); // Oakville AVA, Napa
  const rrv = await mkVineyard("Russian River Ranch", "RRR", 38.5058, -122.8536); // Russian River Valley, Sonoma

  const blockCab = await prisma.vineyardBlock.create({
    data: { vineyardId: oakville.id, blockLabel: "Block 1 — Cabernet", code: "1", varietyId: cab.id, polygon: squareAround(38.4386, -122.4097) },
  });
  const blockPinot = await prisma.vineyardBlock.create({
    data: { vineyardId: rrv.id, blockLabel: "Block 1 — Pinot", code: "1", varietyId: pinot.id, polygon: squareAround(38.5058, -122.8536) },
  });
  const blockChard = await prisma.vineyardBlock.create({
    data: { vineyardId: rrv.id, blockLabel: "Block 2 — Chardonnay", code: "2", varietyId: chard.id, polygon: squareAround(38.5075, -122.8560) },
  });
  console.log("vineyards + blocks created (real coords, fake polygons)");

  // ---- harvest picks (2024) — leave the Chardonnay UNPROCESSED --------------
  const mkRecord = (blockId: string, vineyardId: string) =>
    prisma.harvestRecord.create({
      data: { blockId, vineyardId, vintageYear: 2024, createdByEmail: ACTOR.actorEmail },
    });
  const mkPick = (harvestRecordId: string, weightKg: number, brix: number, day: string) =>
    prisma.harvestPick.create({
      data: { harvestRecordId, weightKg, brixAtPick: brix, pickDate: new Date(day), createdByEmail: ACTOR.actorEmail },
    });

  const recCab = await mkRecord(blockCab.id, oakville.id);
  const pickCab = await mkPick(recCab.id, 12000, 25.5, "2024-09-20");
  const recPinot = await mkRecord(blockPinot.id, rrv.id);
  const pickPinot = await mkPick(recPinot.id, 9000, 24.0, "2024-09-15");
  const recChard = await mkRecord(blockChard.id, rrv.id);
  await mkPick(recChard.id, 8000, 22.5, "2024-09-12"); // NOT crushed — unprocessed fruit
  console.log("harvest picks created (Chardonnay left unprocessed)");

  // ---- crush → MUST lots ----------------------------------------------------
  const crushCab = await crushLotCore(ACTOR, {
    commandId: "demo-crush-cab",
    picks: [{ pickId: pickCab.id, consumedKg: 10000 }],
    destVesselId: tankCab.id,
    outputVolumeL: 7300,
    target: { mode: "NEW", vintage: 2024 },
    fruitCostPerKg: 2.5,
  });
  const crushPinot = await crushLotCore(ACTOR, {
    commandId: "demo-crush-pinot",
    picks: [{ pickId: pickPinot.id, consumedKg: 8000 }],
    destVesselId: tankPinot.id,
    outputVolumeL: 5800,
    target: { mode: "NEW", vintage: 2024 },
    fruitCostPerKg: 3.0,
  });
  console.log(`crushed: Cab ${crushCab.lotCode}, Pinot ${crushPinot.lotCode}`);

  // ---- daily ferment Brix + temp (mid-fermentation) -------------------------
  const fermentDays: Array<[string, number, number]> = [
    ["2024-09-21", 24, 26], ["2024-09-23", 18, 28], ["2024-09-25", 11, 27], ["2024-09-27", 5, 24],
  ];
  for (const [day, brix, temp] of fermentDays) {
    await submitPanelCore(ACTOR, {
      panelId: `demo-ferment-cab-${day}`,
      commandId: `demo-ferment-cab-${day}`,
      vesselId: tankCab.id,
      lotId: crushCab.lotId,
      occupancyToken: `${tankCab.id}:${crushCab.lotId}`,
      deviceObservedAt: `${day}T08:00:00Z`,
      readings: [
        { captureId: `cab-brix-${day}`, analyte: "BRIX", value: brix, unit: "°Bx" },
        { captureId: `cab-temp-${day}`, analyte: "TEMP", value: temp, unit: "°C" },
      ],
    });
  }
  console.log("logged 4 days of ferment Brix + temp on the Cab must");

  // ---- costed additions (SO2 + bentonite) -----------------------------------
  const mkMaterial = async (name: string, normalizedKey: string, kind: string, unitCost: number) => {
    const m =
      (await prisma.cellarMaterial.findFirst({ where: { normalizedKey } })) ??
      (await prisma.cellarMaterial.create({
        data: { name, normalizedKey, kind, isStockTracked: true, stockUnit: "g" },
      }));
    await prisma.supplyLot.create({
      data: { materialId: m.id, qtyReceived: 5000, qtyRemaining: 5000, stockUnit: "g", unitCost, receivedAt: new Date("2024-08-01") },
    });
    return m;
  };
  await mkMaterial("Potassium Metabisulfite", "KMBS", "SO2", 0.05);
  await mkMaterial("Bentonite", "BENTONITE", "FINING", 0.02);
  await addAdditionCore(ACTOR, { vesselId: tankCab.id, materialName: "Potassium Metabisulfite", materialKind: "SO2", rateValue: 40, rateBasis: "MG_L" });
  await addAdditionCore(ACTOR, { vesselId: tankPinot.id, materialName: "Potassium Metabisulfite", materialKind: "SO2", rateValue: 35, rateBasis: "MG_L" });
  console.log("received supplies with cost + dosed SO2 (cost drawn down)");

  // ---- press the Cab must → free-run tank + press fraction to barrel --------
  const press = await pressLotCore(ACTOR, {
    commandId: "demo-press-cab",
    parentLotId: crushCab.lotId,
    sourceVesselId: tankCab.id,
    lossL: 300,
    op: "PRESS",
    fractions: [
      { destVesselId: tankFreeRun.id, volumeL: 6000, label: "free-run" },
      { destVesselId: barrelPress.id, volumeL: 900, label: "press", estimated: true },
    ],
  });
  console.log(`pressed Cab → free-run + press barrel (op ${press.operationId})`);

  // ---- analyses: pH / TA / ABV on tank + barrel -----------------------------
  await recordMeasurementsCore(ACTOR, {
    vesselId: tankFreeRun.id,
    observedAt: new Date("2024-10-05"),
    readings: [
      { analyte: "PH", value: 3.62, unit: "pH" },
      { analyte: "TA", value: 6.1, unit: "g/L" },
      { analyte: "ALCOHOL", value: 14.5, unit: "% v/v" },
    ],
  });
  await recordMeasurementsCore(ACTOR, {
    vesselId: barrelPress.id,
    observedAt: new Date("2024-10-06"),
    readings: [
      { analyte: "PH", value: 3.7, unit: "pH" },
      { analyte: "ALCOHOL", value: 14.8, unit: "% v/v" },
    ],
  });
  console.log("recorded pH/TA/ABV analyses on tank + barrel");

  // ---- blend: free-run Cab + Pinot → a blend lot in tank --------------------
  const freeRunResident = await prisma.vesselLot.findFirst({ where: { vesselId: tankFreeRun.id } });
  const freeRunLotId = freeRunResident?.lotId ?? crushCab.lotId;
  const blend = await blendLotsCore(ACTOR, {
    mode: "NEW_LOT",
    token: "RED",
    vintage: 2024,
    toVesselId: tankBlend.id,
    components: [
      { vesselId: tankFreeRun.id, lotId: freeRunLotId, drawL: 3000 },
      { vesselId: tankPinot.id, lotId: crushPinot.lotId, drawL: 2000 },
    ],
  });
  console.log(`blended ${blend.childCode} (${blend.childTotalL} L) in tank`);

  // ---- a fortified/high-ABV lot for tax class B (>16%) ----------------------
  // Move a little Pinot into a small tank and mark it 18% ABV so removals span two 5120 columns.
  await recordMeasurementsCore(ACTOR, {
    vesselId: tankPinot.id,
    observedAt: new Date("2024-10-07"),
    readings: [{ analyte: "ALCOHOL", value: 13.4, unit: "% v/v" }],
  });
  await prisma.lot.update({ where: { id: crushPinot.lotId }, data: { taxAbvOverride: 13.4 } });
  await prisma.lot.update({ where: { id: blend.childLotId }, data: { taxAbvOverride: 18.0 } }); // class B

  // ---- bottling → warehouse (finished goods with ABV) -----------------------
  const runId = await executeBottling(
    {
      vesselIds: [tankFreeRun.id],
      destinationLocationId: warehouse.id,
      skuName: "Demo Winery Cabernet Sauvignon",
      skuVintage: 2024,
      bottlesProduced: 1200, // ~900 L
      abv: 14.5,
      date: new Date("2024-10-20"),
    },
    ACTOR,
  );
  console.log(`bottled 1200 btl to warehouse (run ${runId})`);

  // ---- bond → taxpaid removals (feed 5120 removed + 5000 excise) ------------
  await removeTaxpaidCore(ACTOR, {
    vesselId: tankFreeRun.id, // class A (14.5%)
    volumeL: 800,
    disposition: "TAXPAID",
    observedAt: new Date("2024-11-15"),
    commandId: "demo-removal-a",
  });
  await removeTaxpaidCore(ACTOR, {
    vesselId: tankBlend.id, // class B (18%)
    volumeL: 400,
    disposition: "TAXPAID",
    observedAt: new Date("2024-11-20"),
    commandId: "demo-removal-b",
  });
  console.log("removed wine from bond taxpaid (class A + class B)");

  // ---- generate + print the TTB 5120.17 and 5000.24 -------------------------
  const periodStart = new Date("2024-01-01");
  const periodEnd = new Date("2024-12-31");
  const r5120 = await generateReport(TENANT, { periodStart, periodEnd });
  console.log(`\n=== TTB 5120.17 (2024) — report ${r5120.reportId} ===`);
  console.log(JSON.stringify(r5120.fold, null, 2).slice(0, 1600));

  const r5000 = await generateExciseReturn(TENANT, { periodStart, periodEnd, cadence: "ANNUAL" });
  console.log(`\n=== TTB 5000.24 (2024 annual) — report ${r5000.reportId} · net tax $${Number(r5000.netTax).toFixed(2)} ===`);

  console.log("\n✅ Demo scenario seeded. Log in as owner@demowinery.test to explore.");
}

async function run() {
  const { runAsTenant } = await import("../src/lib/tenant/context");
  const attempts = Number(process.env.SEED_ATTEMPTS || "5");
  for (let i = 1; i <= attempts; i++) {
    try {
      await runAsTenant(TENANT, () => main());
      return;
    } catch (e) {
      if (i < attempts && /reach|connection|timeout|ECONN|socket|Closed/i.test(String(e))) {
        console.warn(`attempt ${i} conn issue (airplane wifi?), retry…`);
        await new Promise((r) => setTimeout(r, 3000 * i));
        continue;
      }
      throw e;
    }
  }
}
run().then(() => process.exit(0)).catch((e) => { console.error("seed-demo-scenario failed:", e); process.exit(1); });
