/**
 * Remove the QA-CARDS* work orders left behind by the browser QA for the multi-card
 * confirm fix. Demo Winery ONLY — never Bhutan.
 *   npx tsx --conditions=react-server --env-file=.env scripts/qa-cards-clean.ts
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";

const TENANT = "org_demo_winery";

async function main() {
  await runAsTenant(TENANT, async () => {
    const wos = await prisma.workOrder.findMany({
      where: { title: { startsWith: "QA-CARDS" } },
      select: { id: true, number: true, title: true },
    });
    if (wos.length === 0) {
      console.log("nothing to clean.");
      return;
    }
    const ids = wos.map((w) => w.id);
    for (const w of wos) console.log(`removing #${w.number} ${w.title}`);
    // Children first — the FKs are RESTRICT, so a parent-first delete just errors out.
    await prisma.workOrderTask.deleteMany({ where: { workOrderId: { in: ids } } });
    await prisma.workOrderDependency.deleteMany({ where: { workOrderId: { in: ids } } });
    await prisma.workOrderDependency.deleteMany({ where: { dependsOnWorkOrderId: { in: ids } } });
    await prisma.workOrder.deleteMany({ where: { id: { in: ids } } });
    console.log(`cleaned ${ids.length} QA-CARDS work order(s).`);
  });
}

void main();
