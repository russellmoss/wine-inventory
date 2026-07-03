/**
 * Seed the starter material catalog into the Demo Winery sandbox tenant (Phase 9.1 Unit 1). Idempotent
 * — find-or-create by (kind, normalizedKey); re-running is a no-op. Each material is stock-tracked +
 * depletable so work-order additions/sanitizes draw it down; no opening stock is seeded (receive real
 * stock via /setup/expendables).
 *
 *   npm run seed:starter-materials
 *
 * Requires `npm run seed:demo-tenant` first so org_demo_winery exists. Runs as owner via runAsTenant.
 */
import { prisma } from "@/lib/prisma";
import { seedStarterMaterials, STARTER_MATERIALS } from "@/lib/onboarding/seed-starter-materials";
import { disconnectSystem } from "../src/lib/tenant/system";

const DEMO_ORG_ID = "org_demo_winery";

async function main() {
  const { seeded } = await seedStarterMaterials(DEMO_ORG_ID);
  for (const m of STARTER_MATERIALS) {
    console.log(`✓ ${m.kind.padEnd(10)} ${m.name} (${m.stockUnit}${m.defaultBasis ? `, ${m.defaultBasis}` : ""})`);
  }
  console.log(`\nStarter materials seeded ✓ (${seeded} in catalog; idempotent — re-run is a no-op)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await disconnectSystem();
  });
