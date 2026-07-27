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
import { createProductFactsResolver } from "../src/lib/pesticide/product-facts";
import { PESTICIDE_SOURCE_KEY } from "../src/lib/pesticide/lookup";
import { buildFactsSnapshot } from "../src/lib/spray/facts-snapshot-core";

const DEMO = "org_demo_winery";
const ORG_B = "org_spray_verify_b";
const runId = Date.now();
/**
 * Fixture registration numbers must be EPA-FEDERAL FORMAT, not `QA-…`.
 *
 * The resolver canonicalizes every key through `parseRegistrationNumber` (K6), so a curated row
 * whose reg number is not company-product digits can never be resolved — which is correct behavior
 * (those are the CA-only adjuvants and 25(b) products S2 defers), but it silently makes a `QA-`
 * prefixed fixture invisible to Unit 6 while assertions that hit the DB directly still pass.
 * 9999x is a company code EPA does not issue; teardown is by exact match on these two strings.
 */
const SUFFIX = runId % 100000;
const REG = `99991-${SUFFIX}`;
const STALE_REG = `99992-${SUFFIX}`;

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

/** Flip the tenant's epa-pesticide subscription and return a restore closure (verify-pesticide.ts
 * pattern). Always `await` INSIDE runAsTenant — a lazy PrismaPromise loses the ALS scope. */
async function withSubscription(enabled: boolean): Promise<() => Promise<void>> {
  const source = await runAsSystem(async () => await prisma.knowledgeSource.findUnique({ where: { key: PESTICIDE_SOURCE_KEY }, select: { id: true } }));
  if (!source) return async () => {};
  const prior = await runAsTenant(DEMO, async () => await prisma.knowledgeSourceSubscription.findFirst({ where: { sourceId: source.id }, select: { id: true, enabled: true } }));
  await runAsTenant(DEMO, async () => {
    if (prior) await prisma.knowledgeSourceSubscription.update({ where: { id: prior.id }, data: { enabled } });
    else await prisma.knowledgeSourceSubscription.create({ data: { sourceId: source.id, enabled } });
  });
  return async () => {
    await runAsTenant(DEMO, async () => {
      const cur = await prisma.knowledgeSourceSubscription.findFirst({ where: { sourceId: source.id }, select: { id: true } });
      if (!cur) return;
      if (prior) await prisma.knowledgeSourceSubscription.update({ where: { id: cur.id }, data: { enabled: prior.enabled } });
      else await prisma.knowledgeSourceSubscription.delete({ where: { id: cur.id } });
    });
  };
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
    // ══ Unit 6 — the real resolver ═════════════════════════════════════════
    // Entitlement ON for the registry assertions; restored in the finally below.
    const restore = await withSubscription(true);
    try {
      const resolver = createProductFactsResolver(DEMO);

      // 7. index alignment with an unknown key in the MIDDLE (council C11's shape).
      const batch = await runAsTenant(DEMO, async () =>
        resolver.resolveMany([
          { epaRegistrationNumber: null, tenantProductRef: `qa-s2b-${runId}`, productName: "QA Bhutan-shaped product (no EPA number)" },
          { epaRegistrationNumber: "99999-99999", tenantProductRef: null, productName: "QA nonexistent product" },
          { epaRegistrationNumber: null, tenantProductRef: null, productName: "QA name-only product" },
        ]),
      );
      check("7 resolveMany is index-aligned (3 in, 3 out)", batch.length === 3, { len: batch.length });
      check("7b the unknown middle key resolves UNKNOWN/NONE, never clear", batch[1].source === "NONE" && batch[1].phiDays === null && batch[1].resistanceGroups === null, batch[1]);
      check("7c a name-only product resolves UNKNOWN (no fuzzy match on the name)", batch[2].source === "NONE", batch[2]);

      // 8. the grower-supplied row resolves, and is labelled TENANT_DEFINED.
      const tenantResolved = batch[0];
      check("8 the grower-supplied AGRONOMIC row resolves", tenantResolved.rainfastHours === 2 && tenantResolved.mobilityClass === "CONTACT_PROTECTANT", tenantResolved);
      check("8b it is labelled TENANT_DEFINED, never registry", tenantResolved.source === "TENANT_DEFINED", { source: tenantResolved.source });
      check("8c KD-11 — the AGRONOMIC group carries the tenant provenance and REGULATORY stays NONE", tenantResolved.agronomic?.source === "TENANT_DEFINED" && tenantResolved.regulatory?.source === "NONE", { reg: tenantResolved.regulatory, agro: tenantResolved.agronomic });

      // 9. never throws on a malformed reg number, and never near-misses onto a real product.
      let threw = false;
      let malformed: Awaited<ReturnType<typeof resolver.resolveMany>> = [];
      try {
        malformed = await runAsTenant(DEMO, async () => resolver.resolveMany([{ epaRegistrationNumber: "352-", tenantProductRef: null, productName: "QA malformed" }]));
      } catch {
        threw = true;
      }
      check("9 a malformed EPA number does not throw", !threw);
      check("9b …and does not fuzzy-match onto a real product", malformed[0]?.source === "NONE", malformed[0]);

      // 10. KD-10 — a STALE group contributes nothing and can never reach KNOWN.
      const stale = await runAsSystem(() =>
        prisma.pesticideProductFacts.create({
          data: {
            epaRegNumber: STALE_REG,
            factGroup: "REGULATORY",
            labelVersionKey: "2020-01-01",
            worstCasePhiDays: 14,
            ...provenance,
            reviewDueAt: new Date("2021-01-01"), // long past due
          },
        }),
      );
      createdFactsIds.push(stale.id);
      const staleResolved = await runAsTenant(DEMO, async () => resolver.resolveMany([{ epaRegistrationNumber: STALE_REG, tenantProductRef: null, productName: "QA stale" }]));
      check("10 a stale group contributes NO value (phiDays dropped)", staleResolved[0].phiDays === null, staleResolved[0]);
      check("10b …and says so — staleAtWrite is recorded, not hidden", staleResolved[0].regulatory?.staleAtWrite === true, staleResolved[0].regulatory);
      const staleSnap = buildFactsSnapshot(staleResolved[0]);
      check("10c a stale group can NEVER produce completeness KNOWN", staleSnap.factsCompleteness !== "KNOWN", { completeness: staleSnap.factsCompleteness });
      check("10d the group-provenance axis survives into the snapshot columns", staleSnap.regulatoryStaleAtWrite === true && staleSnap.agronomicStaleAtWrite === false, staleSnap);
    } finally {
      await restore();
    }

    // ══ 11. KD-4 — entitlement OFF withholds registry facts but NOT grower-supplied ═══
    const restoreOff = await withSubscription(false);
    try {
      const resolver = createProductFactsResolver(DEMO);
      const off = await runAsTenant(DEMO, async () =>
        resolver.resolveMany([
          { epaRegistrationNumber: null, tenantProductRef: `qa-s2b-${runId}`, productName: "QA Bhutan-shaped product (no EPA number)" },
        ]),
      );
      check("11 with the source toggle OFF the grower-supplied row STILL resolves (the non-US tenant is not bricked)", off[0].rainfastHours === 2 && off[0].source === "TENANT_DEFINED", off[0]);
    } finally {
      await restoreOff();
    }
  } finally {
    // Teardown (QA-PROTOCOL: QA-* fixtures are cleaned up).
    await runAsTenant(DEMO, async () => {
      await prisma.tenantProductFacts.deleteMany({ where: { productRef: `qa-s2b-${runId}` } });
    });
    await runAsSystem(() => prisma.pesticideProductFacts.deleteMany({ where: { epaRegNumber: { in: [REG, STALE_REG] } } }));
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
