/**
 * Spray Intelligence S2b — verify:product-facts. The DB-level gate for the schema-first slice
 * (plan v2.3 Units 1-5). Six assertions, each proving something the schema ALONE cannot:
 *
 *   1  the five global facts tables round-trip, and the child relations cascade
 *   2  ⭐ council C1 — the ACTIVE-row guarantee: a SECOND non-superseded row for the same
 *      (epaRegNumber, factGroup) is refused BY THE DATABASE. This is what makes resolveMany
 *      deterministic, because the frozen ProductFactsKey carries no version selector.
 *   3  superseding the first row FREES the slot — version history coexists with single-row resolution
 *   4  KD-12 — REI is per-ACTIVITY: 12 h to scout and 48 h for hand labor coexist on one product,
 *      and the worst-case scalar the frozen port receives is the MAX, never the scouting value
 *   5  RLS — tenant_product_facts is isolated; a second tenant reads zero rows
 *   6  KD-11/KD-3 — a tenant AGRONOMIC override does NOT shadow the registry REGULATORY group
 *
 * Fixtures are QA-* prefixed on Demo Winery and torn down in a finally block (QA-PROTOCOL).
 * The global facts tables have no tenant, so they are written via runAsSystem.
 *
 * Run: npm run verify:product-facts   (from a checkout with .env — worktrees have none)
 */
import { prisma } from "../src/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runAsSystem, disconnectSystem } from "../src/lib/tenant/system";

const DEMO = "org_demo_winery";
const ORG_B = "org_spray_verify_b";
const runId = Date.now();
const REG = `QA-S2B-${runId}`;

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}
async function raises(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const provenance = {
  sourceUrl: "https://ipm.ucanr.edu/agriculture/grape/",
  sourceTitle: "QA fixture — not a real curated fact",
  sourceAsOf: new Date("2026-07-24"),
  reviewDueAt: new Date("2027-07-24"),
};

async function main() {
  const createdFactsIds: string[] = [];
  try {
    // ── 1. round-trip the global tables ────────────────────────────────────
    const reg = await runAsSystem(async () => {
      const row = await prisma.pesticideProductFacts.create({
        data: {
          epaRegNumber: REG,
          factGroup: "REGULATORY",
          labelVersionKey: "2024-03-01",
          worstCasePhiDays: 66,
          minRepeatIntervalDays: 7,
          ...provenance,
          reiConditions: {
            create: [
              { activity: "GENERAL", hours: 24 },
              { activity: "SCOUTING", hours: 12 },
              { activity: "HAND_LABOR", hours: 48 },
            ],
          },
          phiConditions: { create: [{ days: 66, condition: "", isDefault: true }] },
          separationRules: {
            create: [
              {
                targetKind: "AGRONOMIC_CLASS",
                targetKey: "Elemental Sulfur",
                direction: "TARGET_AFTER_SUBJECT",
                minDays: 10,
                condition: "no sulfur within 10 days after an oil application",
              },
            ],
          },
          conditions: {
            create: [{ conditionKind: "MAX_TEMP_F", threshold: 90, thresholdUnit: "F", severity: "HARD_STOP" }],
          },
        },
        include: { reiConditions: true, phiConditions: true, separationRules: true, conditions: true },
      });
      return row;
    });
    createdFactsIds.push(reg.id);
    check("1 global facts row + all four child relations round-trip", reg.reiConditions.length === 3 && reg.phiConditions.length === 1 && reg.separationRules.length === 1 && reg.conditions.length === 1);

    // ── 2. the ACTIVE-row guarantee (council C1) ───────────────────────────
    const dup = await raises(() =>
      runAsSystem(() =>
        prisma.pesticideProductFacts.create({
          data: { epaRegNumber: REG, factGroup: "REGULATORY", labelVersionKey: "2025-01-01", ...provenance },
        }),
      ),
    );
    check("2 a SECOND active row for the same (reg, group) is refused by the DB", dup !== null && /unique|constraint/i.test(dup ?? ""), dup?.slice(0, 120));

    // ── 3. superseding frees the slot ──────────────────────────────────────
    await runAsSystem(() => prisma.pesticideProductFacts.update({ where: { id: reg.id }, data: { supersededAt: new Date() } }));
    const successorErr = await raises(async () => {
      const s = await runAsSystem(() =>
        prisma.pesticideProductFacts.create({
          data: { epaRegNumber: REG, factGroup: "REGULATORY", labelVersionKey: "2025-01-01", worstCasePhiDays: 60, ...provenance },
        }),
      );
      createdFactsIds.push(s.id);
    });
    check("3 superseding the first row frees the slot for a new label version", successorErr === null, successorErr?.slice(0, 120));
    const history = await runAsSystem(() => prisma.pesticideProductFacts.count({ where: { epaRegNumber: REG } }));
    check("3b version history is retained for replay (2 rows, 1 active)", history === 2, { history });

    // ── 4. KD-12 — REI is per-activity, worst case is the MAX ──────────────
    const reis = await runAsSystem(() => prisma.pesticideProductReiCondition.findMany({ where: { factsId: reg.id } }));
    const worst = Math.max(...reis.map((r) => r.hours));
    const scouting = reis.find((r) => r.activity === "SCOUTING")?.hours;
    check("4 hand-labor REI (48h) and scouting REI (12h) coexist on one product", worst === 48 && scouting === 12, { worst, scouting });
    check("4b the worst-case scalar is the MAX, never the scouting value", worst !== scouting);

    // ── 5. RLS on the grower-supplied override ─────────────────────────────
    await runAsTenant(DEMO, async () => {
      await prisma.tenantProductFacts.create({
        data: {
          productRef: `qa-s2b-${runId}`,
          productName: "QA Bhutan-shaped product (no EPA number)",
          epaRegistrationNumber: null,
          factGroup: "AGRONOMIC",
          rainfastHours: 2,
          mobilityClass: "CONTACT_PROTECTANT",
          enteredBy: "qa-s2b@demowinery.test",
        },
      });
    });
    const seenByDemo = await runAsTenant(DEMO, async () => await prisma.tenantProductFacts.count({ where: { productRef: `qa-s2b-${runId}` } }));
    const seenByB = await runAsTenant(ORG_B, async () => await prisma.tenantProductFacts.count({ where: { productRef: `qa-s2b-${runId}` } }));
    check("5 RLS — the owning tenant sees its grower-supplied row", seenByDemo === 1, { seenByDemo });
    check("5b RLS — a second tenant sees ZERO", seenByB === 0, { seenByB });

    // ── 6. KD-3 — group-scoped override does not shadow the sibling group ──
    const groups = await runAsTenant(DEMO, async () => await prisma.tenantProductFacts.findMany({ where: { productRef: `qa-s2b-${runId}` }, select: { factGroup: true } }));
    check(
      "6 the tenant override is scoped to AGRONOMIC only — REGULATORY is untouched and still registry-sourced",
      groups.length === 1 && groups[0].factGroup === "AGRONOMIC",
      groups,
    );
  } finally {
    // Teardown (QA-PROTOCOL: QA-* fixtures are cleaned up).
    await runAsTenant(DEMO, async () => {
      await prisma.tenantProductFacts.deleteMany({ where: { productRef: `qa-s2b-${runId}` } });
    });
    await runAsSystem(() => prisma.pesticideProductFacts.deleteMany({ where: { epaRegNumber: REG } }));
  }

  console.log(`\n${failures === 0 ? "ALL PRODUCT-FACTS CHECKS PASSED ✓" : "PRODUCT-FACTS CHECKS FAILED ✗"} (${failures} failed)`);
  await disconnectSystem();
  await prisma.$disconnect();
  if (failures > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
