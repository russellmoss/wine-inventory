/**
 * Seed the system work-order templates into the Demo Winery sandbox tenant (Phase 9 Unit 10). Idempotent
 * — upserts by (tenantId, code); re-running is a no-op. System templates are the shipped defaults a
 * tenant clones-on-customize; they can't be edited in place (updateTemplateSpecCore blocks isSystem).
 *
 *   npm run seed:work-order-templates
 *
 * Requires `npm run seed:demo-tenant` first so org_demo_winery exists. Runs as owner via runAsTenant.
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { validateTemplateSpec, type TemplateSpec } from "@/lib/work-orders/template-vocabulary";
import { disconnectSystem } from "../src/lib/tenant/system";

const DEMO_ORG_ID = "org_demo_winery";

type SystemTemplate = { code: string; name: string; description: string; category: string; recurringCadence?: string | null; spec: TemplateSpec };

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    code: "SYS-RACK",
    name: "Rack a tank",
    description: "Move wine from one vessel to another (off the lees).",
    category: "Cellar",
    spec: { tasks: [{ taskType: "RACK", title: "Rack tank to destination", defaults: { lossL: 0 }, instructions: "Rack cleanly off the gross lees." }] },
  },
  {
    code: "SYS-ADD-SO2",
    name: "SO₂ addition",
    description: "Add sulfur dioxide to a lot at a target rate.",
    category: "Cellar",
    recurringCadence: "MONTHLY",
    spec: { tasks: [{ taskType: "ADDITION", title: "Add SO₂", defaults: { rateBasis: "MG_PER_L" }, instructions: "Dose to the target free-SO₂ rate; stir gently." }] },
  },
  {
    code: "SYS-TOP",
    name: "Top the barrels",
    description: "Top a vessel from a keg to eliminate headspace.",
    category: "Cellar",
    recurringCadence: "WEEKLY",
    spec: { tasks: [{ taskType: "TOPPING", title: "Top vessel from keg", instructions: "Top to the bung; log the volume added." }] },
  },
  {
    code: "SYS-FERMENT-MONITOR",
    name: "Ferment monitor",
    description: "Log a Brix reading during active fermentation.",
    category: "Ferment",
    recurringCadence: "WEEKLY",
    spec: { tasks: [{ taskType: "BRIX", title: "Log Brix", instructions: "Read Brix at cap; note temperature." }] },
  },
];

async function main() {
  await runAsTenant(DEMO_ORG_ID, async () => {
    for (const t of SYSTEM_TEMPLATES) {
      const v = validateTemplateSpec(t.spec);
      if (!v.ok) throw new Error(`Template ${t.code} is invalid: ${v.errors.join(" ")}`);

      const existing = await prisma.workOrderTemplate.findUnique({ where: { tenantId_code: { tenantId: DEMO_ORG_ID, code: t.code } }, select: { id: true, currentVersion: true } });
      if (existing) {
        console.log(`✓ ${t.code} already present (v${existing.currentVersion})`);
        continue;
      }
      const created = await prisma.workOrderTemplate.create({
        data: {
          code: t.code,
          name: t.name,
          description: t.description,
          category: t.category,
          isSystem: true,
          recurringCadence: t.recurringCadence ?? null,
          currentVersion: 1,
          // tenantId explicit on the nested create (the extension only auto-injects on top-level data).
          versions: { create: { tenantId: DEMO_ORG_ID, version: 1, spec: t.spec as object, createdByEmail: "system@seed" } },
        },
        select: { id: true },
      });
      console.log(`+ seeded ${t.code} (${created.id})`);
    }
  });
  console.log("\nSystem work-order templates seeded ✓");
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
