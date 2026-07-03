/**
 * Phase 16 Unit 11 — seed a demo Commerce7 setup in the Demo Winery sandbox so the Settings cards +
 * the /accounting Commerce7 section render with data for manual QA. Idempotent. Uses a CONNECTED
 * connection with a fake external tenant (the real live smoke uses the Unit-0 sandbox keys). Does NOT
 * ingest real orders — run verify:commerce7 for the full loop.
 *
 *   npm run seed:demo-commerce7
 */
process.env.COMMERCE7_APP_ID = process.env.COMMERCE7_APP_ID || "test-app";
process.env.COMMERCE7_SECRET_KEY = process.env.COMMERCE7_SECRET_KEY || "test-secret";

import { prismaBase } from "@/lib/prisma";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";

const TENANT = "org_demo_winery";

async function main() {
  await runAsTenant(TENANT, async () => {
    // A CONNECTED Commerce7 connection (fake external tenant for the demo).
    const existing = await prisma.commerce7Connection.findFirst({ where: { provider: "COMMERCE7" }, select: { id: true } });
    if (!existing) {
      await prisma.commerce7Connection.create({
        data: { provider: "COMMERCE7", status: "CONNECTED", environment: "sandbox", externalTenantId: "demo-winery-c7", scopes: ["Order Read", "Product Read", "Product Write"], companyName: "Demo Winery (C7)", connectedAt: new Date(), webhookId: "demo-webhook", webhookConfiguredAt: new Date() },
      });
      console.log("• created a CONNECTED Commerce7 connection (demo-winery-c7)");
    } else {
      console.log("• Commerce7 connection already present — left as-is");
    }

    // DTC sales accounts on AppSettings (so mapping + posting are enabled in the demo).
    const s = await prisma.appSettings.findFirst({ select: { id: true } });
    const dtc = { dtcRevenueAccount: "4000", dtcTaxAccount: "2200", dtcShippingAccount: "4100", dtcClearingAccount: "1499", dtcDiscountAccount: "4900" };
    if (s) await prisma.appSettings.update({ where: { id: s.id }, data: dtc });
    else await runInTenantTx((tx) => tx.appSettings.create({ data: dtc }));
    console.log("• set demo DTC sales accounts on AppSettings");

    // A SKU map row against the first active WineSku + Location, if any exist.
    const [wineSku, location] = await Promise.all([
      prisma.wineSku.findFirst({ where: { isActive: true }, select: { id: true, name: true } }),
      prisma.location.findFirst({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);
    if (wineSku && location) {
      await prisma.commerce7SkuMap.upsert({
        where: { tenantId_externalVariantId_externalInventoryLocationId: { tenantId: TENANT, externalVariantId: "demo-var-1", externalInventoryLocationId: "demo-c7-loc" } },
        create: { externalProductId: "demo-prod-1", externalVariantId: "demo-var-1", externalSku: "DEMO-PN-2022", externalInventoryLocationId: "demo-c7-loc", wineSkuId: wineSku.id, locationId: location.id, active: true },
        update: { wineSkuId: wineSku.id, locationId: location.id, active: true },
      });
      console.log(`• mapped Commerce7 demo-var-1 → ${wineSku.name} @ ${location.name}`);
    } else {
      console.log("• no active WineSku/Location found — skipped the SKU map (run seed:demo-scenario first)");
    }
  });
  console.log("\nDemo Commerce7 seed complete. Open Settings → Commerce7 and /accounting.");
  await prismaBase.$disconnect();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); await prismaBase.$disconnect(); process.exit(1); });
