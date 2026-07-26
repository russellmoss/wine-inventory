/**
 * Spray S2 Unit 11 — end-to-end proof for the pesticide registration + resistance master.
 *
 *   npm run verify:pesticide
 *
 * Asserts the full chain against the LIVE tables (Demo Winery, never Bhutan): registration →
 * siteModifier → AI → resistance code + siteType → CA status → the entitlement gate → the
 * jurisdiction gate → the K13 premix rollup → the coverage report's zero-unclassified property.
 *
 * The entitlement case calls the REAL lookup.ts with the subscription off (council C7) —
 * verify:kb-subscriptions proves the generic toggle works and proves nothing about this lane.
 */
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { lookupRegistration, isPesticideSourceEnabled, PESTICIDE_SOURCE_KEY } from "@/lib/pesticide/lookup";
import { REGISTRATION_CASES, RESISTANCE_CASES } from "./pesticide-verify-cases";

const TENANT = "org_demo_winery";

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string, detail = "") {
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (cond) passed++;
  else failed++;
}

/** Set the tenant's subscription for the pesticide source, returning a restore fn. */
async function withSubscription(enabled: boolean): Promise<() => Promise<void>> {
  const sourceId = await runAsSystem(async (db) => {
    const s = await db.knowledgeSource.findUnique({ where: { key: PESTICIDE_SOURCE_KEY }, select: { id: true } });
    if (!s) throw new Error(`${PESTICIDE_SOURCE_KEY} not seeded — run: npm run seed:knowledge-sources`);
    return s.id;
  });
  const prior = await runAsTenant(TENANT, async () => {
    return await prisma.knowledgeSourceSubscription.findFirst({ where: { sourceId }, select: { id: true, enabled: true } });
  });
  await runAsTenant(TENANT, async () => {
    if (prior) await prisma.knowledgeSourceSubscription.update({ where: { id: prior.id }, data: { enabled } });
    else await prisma.knowledgeSourceSubscription.create({ data: { sourceId, enabled } });
  });
  return async () => {
    await runAsTenant(TENANT, async () => {
      if (prior) await prisma.knowledgeSourceSubscription.update({ where: { id: prior.id }, data: { enabled: prior.enabled } });
      else await prisma.knowledgeSourceSubscription.deleteMany({ where: { sourceId } });
    });
  };
}

async function main() {
  console.log("=== S2 pesticide verify (Demo Winery) ===\n");

  // ── The source ships DARK ────────────────────────────────────────────────────────────────────
  const source = await runAsSystem((db) =>
    db.knowledgeSource.findUnique({ where: { key: PESTICIDE_SOURCE_KEY }, select: { defaultEnabled: true, active: true } }),
  );
  assert(source != null, "epa-pesticide source is seeded");
  assert(source?.defaultEnabled === false, "epa-pesticide defaultEnabled is FALSE (ships dark; non-US tenants stay clean)");

  // ── Entitlement: the REAL service, subscription off (council C7) ──────────────────────────────
  {
    const restore = await withSubscription(false);
    const enabled = await isPesticideSourceEnabled(TENANT);
    assert(enabled === false, "entitlement: a tenant with the subscription OFF is not entitled");
    const r = await lookupRegistration({ tenantId: TENANT, regNumber: "10163-6414", jurisdiction: { country: "US", state: "CA" } });
    assert(r.ok === false && r.reason === "source-not-enabled", "entitlement: the real lookup returns source-not-enabled", JSON.stringify(r));
    await restore();
  }

  // ── Everything below runs entitled ────────────────────────────────────────────────────────────
  const restore = await withSubscription(true);
  try {
    assert(await isPesticideSourceEnabled(TENANT), "entitlement: an explicit enabling subscription grants access");

    // ── Registration + jurisdiction + bearing cases ─────────────────────────────────────────────
    for (const c of REGISTRATION_CASES) {
      const r = await lookupRegistration({
        tenantId: TENANT,
        regNumber: c.regNumber,
        jurisdiction: c.jurisdiction,
        vineSiteContext: c.vineSiteContext,
      });
      const actual = r.ok ? "ok" : r.reason;
      assert(actual === c.expect, c.name, actual === c.expect ? "" : `expected ${c.expect}, got ${actual}`);
    }

    // ── The composite factsAsOf rides on a successful read (K8/C1) ──────────────────────────────
    {
      const r = await lookupRegistration({ tenantId: TENANT, regNumber: "10163-6414", jurisdiction: { country: "US", state: "CA" } });
      if (r.ok) {
        assert(typeof r.factsAsOf.publishedRevisionId === "string" && r.factsAsOf.publishedRevisionId.length > 0, "factsAsOf carries a published revision id");
        assert(r.factsAsOf.apprilAsOf != null, "factsAsOf carries apprilAsOf");
        assert(r.factsAsOf.cdprAsOf != null, "factsAsOf carries cdprAsOf");
        assert(r.factsAsOf.resistanceArtifactSha256 != null, "factsAsOf carries the resistance artifact sha256");
        assert(r.provenance === "registry", "provenance is registry (the grower-supplied arm is S2b's)");
        assert(r.data.grapeSites.every((s) => s.siteModifier !== "NON_BEARING"), "a bearing read never returns a NON_BEARING site row");
      } else {
        assert(false, "factsAsOf: the Gavel read succeeded", r.reason);
      }
    }

    // ── Resistance: the golden cases, through the real service ──────────────────────────────────
    for (const c of RESISTANCE_CASES) {
      const r = await lookupRegistration({ tenantId: TENANT, regNumber: c.regNumber, jurisdiction: { country: "US", state: "CA" } });
      // Some resistance cases are not CA-registered; read the resistance payload directly when the
      // legality composition (correctly) refuses.
      const resistance = r.ok
        ? r.data.resistance
        : await runAsSystem(async (db) => {
            const p = await db.pesticideProduct.findFirst({
              where: { epaRegNumber: c.regNumber },
              select: { ingredients: { select: { activeIngredientId: true } } },
            });
            if (!p) return null;
            const asg = await db.pesticideResistanceAssignment.findMany({
              where: { activeIngredientId: { in: p.ingredients.map((i) => i.activeIngredientId) }, scheme: "FRAC" },
              select: { resolution: true, codes: true, siteType: true },
            });
            if (asg.length === 0) return null;
            const anyGap = asg.some((a) => a.resolution === "GAP");
            const codes = [...new Set(asg.filter((a) => a.resolution === "CODED").flatMap((a) => a.codes))];
            const siteTypes = new Set(asg.filter((a) => a.resolution === "CODED").map((a) => a.siteType));
            return {
              resolution: anyGap ? ("GAP" as const) : codes.length > 0 ? ("CODED" as const) : ("NO_CODE_EXISTS" as const),
              codes,
              siteType: siteTypes.size === 1 ? [...siteTypes][0] : "UNKNOWN",
            };
          });

      if (!resistance) {
        assert(false, c.name, "no resistance payload resolved");
        continue;
      }
      assert(resistance.resolution === c.expectResolution, c.name, `resolution ${resistance.resolution} (expected ${c.expectResolution})`);
      if (c.expectCodes) {
        const got = [...resistance.codes].sort();
        assert(JSON.stringify(got) === JSON.stringify([...c.expectCodes].sort()), `${c.name} — codes`, `got ${JSON.stringify(got)}`);
      }
      if (c.expectSiteType) {
        assert(resistance.siteType === c.expectSiteType, `${c.name} — siteType`, `got ${resistance.siteType}`);
      }
    }

    // ── K13: a premix with one GAP AI resolves GAP at PRODUCT level ─────────────────────────────
    {
      const gapPremix = await runAsSystem(async (db) => {
        const products = await db.pesticideProduct.findMany({
          where: { sourceStatus: "ACTIVE" },
          select: { epaRegNumber: true, ingredients: { select: { activeIngredientId: true } } },
          take: 3000,
        });
        const assignments = new Map(
          (await db.pesticideResistanceAssignment.findMany({ where: { scheme: "FRAC" }, select: { activeIngredientId: true, resolution: true } })).map(
            (a) => [a.activeIngredientId!, a.resolution],
          ),
        );
        return products.find(
          (p) =>
            p.ingredients.length > 1 &&
            p.ingredients.some((i) => assignments.get(i.activeIngredientId) === "CODED") &&
            p.ingredients.some((i) => assignments.get(i.activeIngredientId) === "GAP"),
        );
      });
      if (gapPremix?.epaRegNumber) {
        const r = await lookupRegistration({ tenantId: TENANT, regNumber: gapPremix.epaRegNumber, jurisdiction: { country: "US", state: "CA" } });
        const res = r.ok ? r.data.resistance : null;
        if (res) {
          assert(res.resolution === "GAP", `K13: mixed CODED+GAP premix ${gapPremix.epaRegNumber} resolves GAP at product level`, res.resolution);
          assert(res.partialEvidence === true, "K13: the resolved codes are labelled PARTIAL EVIDENCE, never the answer");
        } else {
          console.log(`(K13 premix ${gapPremix.epaRegNumber} is not CA-registered — rollup asserted in unit tests)`);
        }
      } else {
        assert(false, "K13: a mixed CODED+GAP premix exists to test against");
      }
    }

    // ── Coverage: zero unclassified, and the tri-state is a real distinction ─────────────────────
    {
      const buckets = await runAsSystem(async (db) => {
        const rows = await db.pesticideResistanceAssignment.groupBy({
          by: ["resolution"],
          where: { subjectKind: "ACTIVE_INGREDIENT", scheme: "FRAC" },
          _count: { _all: true },
        });
        const total = await db.pesticideActiveIngredient.count({ where: { products: { some: { product: { sourceStatus: "ACTIVE" } } } } });
        return { rows, total };
      });
      const counted = buckets.rows.reduce((n, r) => n + r._count._all, 0);
      assert(counted === buckets.total, "coverage: every in-scope AI carries a FRAC assignment (zero unclassified)", `${counted}/${buckets.total}`);
      const byRes = Object.fromEntries(buckets.rows.map((r) => [r.resolution, r._count._all]));
      assert((byRes.CODED ?? 0) > 0, "coverage: CODED bucket is non-empty", JSON.stringify(byRes));
      assert((byRes.GAP ?? 0) > 0, "coverage: GAP is a REAL bucket, not an empty formality", JSON.stringify(byRes));
    }

    // ── K14: a withdrawn product stops answering "registered" ────────────────────────────────────
    {
      const withdrawn = await runAsSystem((db) =>
        db.pesticideProduct.findFirst({ where: { sourceStatus: "WITHDRAWN_FROM_SOURCE", epaRegNumber: { not: null } }, select: { epaRegNumber: true } }),
      );
      if (withdrawn?.epaRegNumber) {
        const r = await lookupRegistration({ tenantId: TENANT, regNumber: withdrawn.epaRegNumber, jurisdiction: { country: "US", state: "CA" } });
        assert(r.ok === false, `K14: withdrawn product ${withdrawn.epaRegNumber} does not answer "registered"`, r.ok ? "STILL OK" : r.reason);
      } else {
        console.log("(K14: no withdrawn product in the current data — asserted by the ingest fixture run instead)");
      }
    }
  } finally {
    await restore();
  }

  console.log(`\n${failed === 0 ? "ALL PESTICIDE CHECKS PASSED ✓" : "PESTICIDE CHECKS FAILED ✗"} (${passed} passed, ${failed} failed)`);
  await disconnectSystem();
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
