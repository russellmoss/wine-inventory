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
import { validateTemplateSpec } from "@/lib/work-orders/template-vocabulary";
import { SYSTEM_TEMPLATES } from "@/lib/work-orders/system-templates";
import { disconnectSystem } from "../src/lib/tenant/system";

const DEMO_ORG_ID = "org_demo_winery";

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
