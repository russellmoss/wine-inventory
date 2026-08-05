/**
 * VINEYARD-1 runtime proof — the D9 fence against a REAL database.
 *
 * WHY THIS EXISTS ALONGSIDE `verify:vineyard-scope`. That guard is a static AST scan: it proves every
 * exported action in a vineyard-scoped module REACHES a gate. It cannot prove the gate is *correct* —
 * that a block id resolves to the block's own vineyard, that a cross-site spray record reports BOTH of
 * its vineyards, that a manager's membership set loads at all under the NOBYPASSRLS app role. Those are
 * data questions, and the honest position before this script existed was that nobody had ever observed
 * the fence deny anything. A green static guard plus green unit tests on pure logic is not a proof that
 * a manager is actually refused.
 *
 * It also guards the specific way this fence has ALREADY failed once. Per the security register
 * (2026-07-26), `AppUser.vineyardIds` was silently `[]` for every user because the membership set was
 * selected as a relation off the GLOBAL `user` model, so RLS evaluated it with `app.tenant_id` unset and
 * matched nothing — invisible while the runtime connected as the owner, total at the `app_rls` cutover.
 * That is why check 1 runs `loadVineyardMembershipIds` for real rather than trusting a fixture: an empty
 * set makes EVERY other check in this file vacuously "deny", which would look like a pass.
 *
 * WHAT IT CANNOT COVER, deliberately: the `require*Access` gates reach `getActionUser()` →
 * `getCurrentUser()` → `headers()`, so they only run inside a request. This script proves the two halves
 * that can be wrong offline — the FK resolution and the decision logic — against real rows. The third
 * half, "the action wires the gate in", is what the static guard proves. Neither alone is sufficient.
 *
 * SAFETY: creates its own throwaway tenant (`QA-scope-<runId>`), touches nothing else, and deletes
 * everything in a `finally`. It never writes to the Demo Winery or to a real tenant, so it is safe to
 * point at any database — though it is only MEANINGFUL against one where the app role is NOBYPASSRLS.
 *
 * NOTE it imports `scope-core`, not `scope`: the gates in `scope.ts` reach `@/lib/dal` →
 * `next/navigation`, which cannot load in a plain tsx process (it pulls Next's client router context).
 * That split is the whole reason this proof can exist — see scope-core.ts's header.
 *
 * Run:  npm run verify:vineyard-scope-db
 *       (needs DATABASE_URL + DATABASE_URL_UNPOOLED; see the ci.yml `vineyard-scope-db` job)
 */
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { loadVineyardMembershipIds } from "@/lib/users/vineyard-memberships";
import { canAccessVineyard, type AppUser } from "@/lib/access";
import {
  resolveBlockVineyard,
  resolveSubblockVineyard,
  resolvePlantingAreaVineyard,
  resolveSprayBlockLineVineyard,
  resolveSpatialStyleVineyard,
  resolveBlocksVineyards,
  sprayApplicationVineyardIds,
  vineyardScopeOf,
  narrowVineyardFilter,
} from "@/lib/vineyard/scope-core";

// A per-run suffix so concurrent CI runs cannot collide on the unique (tenantId, name) keys.
const RUN = `${process.pid}-${process.hrtime.bigint().toString(36)}`;
const ORG_ID = `qa-scope-org-${RUN}`;

let failures = 0;
let checks = 0;

function ok(label: string, condition: boolean, detail = ""): void {
  checks++;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq<T>(label: string, actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(label, a === e, `got ${a}, expected ${e}`);
}

/** Sorted, so a set comparison is order-independent. */
const set = (xs: string[]) => [...xs].sort();

async function main(): Promise<void> {
  console.log(`\nVINEYARD-1 runtime proof (tenant ${ORG_ID})\n`);

  // ── Fixtures ────────────────────────────────────────────────────────────────────────────────
  // Global rows (Organization / User / Member carry no tenantId and no RLS) go through the OWNER
  // client; tenant rows go through the app client inside runAsTenant, which is the path under test.
  await runAsSystem(async (db) => {
    await db.organization.create({
      data: { id: ORG_ID, name: `QA-scope ${RUN}`, slug: `qa-scope-${RUN}` },
    });
    for (const [id, role] of [
      [`qa-admin-${RUN}`, "admin"],
      [`qa-mgrA-${RUN}`, "user"],
      [`qa-mgrNone-${RUN}`, "user"],
    ] as const) {
      await db.user.create({
        data: { id, name: id, email: `${id}@qa.invalid`, role, updatedAt: new Date() },
      });
      await db.member.create({
        data: { id: `mem-${id}`, organizationId: ORG_ID, userId: id, role: "member", createdAt: new Date() },
      });
    }
  });

  const fx = await runAsTenant(ORG_ID, async () => {
    const vineyardA = await prisma.vineyard.create({ data: { name: `QA-A-${RUN}` } });
    const vineyardB = await prisma.vineyard.create({ data: { name: `QA-B-${RUN}` } });

    const blockA = await prisma.vineyardBlock.create({
      data: { vineyardId: vineyardA.id, blockLabel: "QA-A1", sortOrder: 0 },
    });
    const blockB = await prisma.vineyardBlock.create({
      data: { vineyardId: vineyardB.id, blockLabel: "QA-B1", sortOrder: 0 },
    });

    const subblockA = await prisma.vineyardSubblock.create({
      data: { blockId: blockA.id, code: "S1", sortOrder: 0 },
    });

    const areaB = await prisma.vineyardPlantingArea.create({
      data: {
        vineyardId: vineyardB.id,
        name: `QA-area-B-${RUN}`,
        geometry: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
        geometryFingerprint: `qa-fp-${RUN}`,
        canonicalAnchor: { epsg: 4326, originX: 0, originY: 0 },
        source: "DRAW",
      },
    });

    // A CROSS-SITE spray pass: the header names vineyard A, but a block line reaches into B. This is
    // the case the hand-written footprint walk exists for, and the one a header-only gate gets wrong.
    const app = await prisma.sprayApplication.create({
      data: {
        vineyardId: vineyardA.id,
        applicatorName: "QA",
        applicationMethod: "AIRBLAST",
        startedAt: new Date(),
        enteredByEmail: `qa-admin-${RUN}@qa.invalid`,
      },
    });
    const lineA = await prisma.sprayBlockLine.create({
      data: {
        applicationId: app.id,
        blockId: blockA.id,
        blockLabelSnapshot: "QA-A1",
        treatedAreaHa: 1,
        treatedAreaSource: "OPERATOR_ENTERED",
        rateBasis: "UNKNOWN",
      },
    });
    await prisma.sprayBlockLine.create({
      data: {
        applicationId: app.id,
        blockId: blockB.id,
        blockLabelSnapshot: "QA-B1",
        treatedAreaHa: 1,
        treatedAreaSource: "OPERATOR_ENTERED",
        rateBasis: "UNKNOWN",
      },
    });

    const styleB = await prisma.spatialStyle.create({
      data: { scope: "VINEYARD", vineyardId: vineyardB.id, metric: "NDVI", name: `QA-style-${RUN}`, mode: "PERCENTILE", paletteId: "viridis", reverse: false },
    });
    const styleSystem = await prisma.spatialStyle.create({
      data: { scope: "SYSTEM", vineyardId: null, metric: "NDVI", name: `QA-sys-${RUN}`, mode: "PERCENTILE", paletteId: "viridis", reverse: false },
    });

    // Manager A is a member of vineyard A only. Manager "None" gets NO membership row on purpose.
    await prisma.userVineyard.create({ data: { userId: `qa-mgrA-${RUN}`, vineyardId: vineyardA.id } });

    return { vineyardA, vineyardB, blockA, blockB, subblockA, areaB, app, lineA, styleB, styleSystem };
  });

  // ── 1. The membership set loads under the app role ───────────────────────────────────────────
  // If this returns [] the whole fence is vacuous and every later "deny" is a false pass. This is the
  // exact shape that regressed once already (security register 2026-07-26).
  console.log("1. membership loading (the historically-broken piece)");
  const mgrAIds = await loadVineyardMembershipIds(`qa-mgrA-${RUN}`, ORG_ID);
  eq("manager A's membership set is exactly [vineyard A]", mgrAIds, [fx.vineyardA.id]);
  ok("…and is NOT empty (an empty set would make every check below vacuous)", mgrAIds.length > 0);
  const mgrNoneIds = await loadVineyardMembershipIds(`qa-mgrNone-${RUN}`, ORG_ID);
  eq("manager None's membership set is empty", mgrNoneIds, []);

  // Built as literals rather than via `toAppUser`: that helper lives in `@/lib/dal`, which pulls in
  // `headers()`. `vineyardIds` is the field under test and it comes from the REAL query above.
  const mk = (suffix: string, role: string, vineyardIds: string[]): AppUser => ({
    id: `qa-${suffix}-${RUN}`,
    name: suffix,
    email: `qa-${suffix}-${RUN}@qa.invalid`,
    role,
    banned: false,
    mustChangePassword: false,
    vineyardIds,
    organizationIds: [ORG_ID],
    activeOrganizationId: ORG_ID,
  });
  const users = {
    admin: mk("admin", "admin", []),
    mgrA: mk("mgrA", "user", mgrAIds),
    mgrNone: mk("mgrNone", "user", mgrNoneIds),
  };

  // ── 2. Each FK path resolves to the RIGHT vineyard ───────────────────────────────────────────
  console.log("\n2. FK resolution (what the static guard cannot check)");
  await runAsTenant(ORG_ID, async () => {
    eq("block → its own vineyard", await resolveBlockVineyard(fx.blockA.id), fx.vineyardA.id);
    ok("block in B does NOT resolve to A", (await resolveBlockVineyard(fx.blockB.id)) === fx.vineyardB.id);
    eq("unknown block id → null (not a throw, not a wrong vineyard)", await resolveBlockVineyard("nope"), null);

    const sub = await resolveSubblockVineyard(fx.subblockA.id);
    eq("subblock → block → vineyard", sub?.vineyardId ?? null, fx.vineyardA.id);

    eq("planting area → vineyard", await resolvePlantingAreaVineyard(fx.areaB.id), fx.vineyardB.id);
    eq("spray block line → block → vineyard", await resolveSprayBlockLineVineyard(fx.lineA.id), fx.vineyardA.id);

    const styleV = await resolveSpatialStyleVineyard(fx.styleB.id);
    eq("vineyard-scope style → its vineyard", styleV?.vineyardId ?? "missing", fx.vineyardB.id);
    const styleS = await resolveSpatialStyleVineyard(fx.styleSystem.id);
    eq("SYSTEM style → null vineyard (the admin-only branch)", styleS?.vineyardId ?? "missing", null);

    eq("multi-block resolve is de-duplicated", set((await resolveBlocksVineyards([fx.blockA.id, fx.blockA.id])) ?? []), [fx.vineyardA.id]);
    eq("multi-block resolve fails closed on an unknown id", await resolveBlocksVineyards([fx.blockA.id, "nope"]), null);

    // THE subtle one: the header says vineyard A, but the record touches A and B.
    const footprint = await sprayApplicationVineyardIds(fx.app.id);
    eq("cross-site spray reports BOTH vineyards, not just the header", set(footprint ?? []), set([fx.vineyardA.id, fx.vineyardB.id]));
    ok("…so the footprint is strictly larger than the header alone", (footprint ?? []).length === 2);
  });

  // ── 3. The decisions those real values produce ───────────────────────────────────────────────
  console.log("\n3. decisions on real rows");
  ok("admin reaches vineyard A", canAccessVineyard(users.admin, fx.vineyardA.id));
  ok("admin reaches vineyard B", canAccessVineyard(users.admin, fx.vineyardB.id));
  ok("manager A reaches vineyard A", canAccessVineyard(users.mgrA, fx.vineyardA.id));
  ok("manager A is DENIED vineyard B", !canAccessVineyard(users.mgrA, fx.vineyardB.id));
  ok("manager with no memberships is DENIED vineyard A", !canAccessVineyard(users.mgrNone, fx.vineyardA.id));
  ok("manager with no memberships is DENIED vineyard B", !canAccessVineyard(users.mgrNone, fx.vineyardB.id));

  // The cross-site record: manager A owns one of its two vineyards, and must still be refused, because
  // the record carries block lines from a site they cannot see.
  const footprint = await runAsTenant(ORG_ID, async () => (await sprayApplicationVineyardIds(fx.app.id)) ?? []);
  ok(
    "manager A is DENIED the cross-site spray record despite owning one of its vineyards",
    !footprint.every((id) => canAccessVineyard(users.mgrA, id)),
  );
  ok("admin is allowed the cross-site spray record", footprint.every((id) => canAccessVineyard(users.admin, id)));

  eq("scope(admin) = all", vineyardScopeOf(users.admin), { kind: "all" });
  eq("scope(manager A) = some[A]", vineyardScopeOf(users.mgrA), { kind: "some", vineyardIds: [fx.vineyardA.id] });
  eq("scope(manager None) = none", vineyardScopeOf(users.mgrNone), { kind: "none" });

  // List-read narrowing on real ids.
  eq("list read for manager A filters to A", narrowVineyardFilter(vineyardScopeOf(users.mgrA), null), [fx.vineyardA.id]);
  eq("list read for manager None filters to EMPTY (never unfiltered)", narrowVineyardFilter(vineyardScopeOf(users.mgrNone), null), []);
  let threw = false;
  try {
    narrowVineyardFilter(vineyardScopeOf(users.mgrA), fx.vineyardB.id);
  } catch {
    threw = true;
  }
  ok("an explicit out-of-scope vineyardId is REFUSED, not silently emptied", threw);
}

async function cleanup(): Promise<void> {
  // Tenant rows first (FKs point at the org), then the global rows. Cascades handle the children.
  //
  // THE SPRAY CHAIN IS APPEND-ONLY (KD-1). Its BEFORE DELETE trigger refuses every delete unless the
  // named purge GUC is on AND the connected role is not `app_rls` (council C15 — the flag alone is
  // settable by the app role, so the owner connection is half the credential). `runAsSystem` supplies
  // the owner half; `set_config(..., true)` supplies the other, and being transaction-LOCAL it only
  // holds for statements in the SAME transaction — which is why the whole teardown is wrapped in one.
  // Deleting the application is sufficient: block/material/mix lines are ON DELETE CASCADE off it and
  // their own triggers see the same GUC. `spray_block_line → vineyard_block` is ON DELETE RESTRICT, so
  // the application must go before the blocks regardless.
  await runAsSystem(async (db) => {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.allow_spray_purge', 'on', true)`;
      await tx.$executeRawUnsafe(`DELETE FROM "spray_application" WHERE "tenantId" = $1`, ORG_ID);
      await tx.$executeRawUnsafe(`DELETE FROM "spatial_style" WHERE "tenantId" = $1`, ORG_ID);
      await tx.$executeRawUnsafe(`DELETE FROM "user_vineyard" WHERE "tenantId" = $1`, ORG_ID);
      await tx.$executeRawUnsafe(`DELETE FROM "vineyard_planting_area" WHERE "tenantId" = $1`, ORG_ID);
      await tx.$executeRawUnsafe(`DELETE FROM "vineyard_subblock" WHERE "tenantId" = $1`, ORG_ID);
      await tx.$executeRawUnsafe(`DELETE FROM "vineyard_block" WHERE "tenantId" = $1`, ORG_ID);
      await tx.$executeRawUnsafe(`DELETE FROM "vineyard" WHERE "tenantId" = $1`, ORG_ID);
      await tx.member.deleteMany({ where: { organizationId: ORG_ID } });
      await tx.user.deleteMany({ where: { id: { in: [`qa-admin-${RUN}`, `qa-mgrA-${RUN}`, `qa-mgrNone-${RUN}`] } } });
      await tx.organization.deleteMany({ where: { id: ORG_ID } });
    }, { timeout: 60_000, maxWait: 60_000 }); // ~11 round trips; Prisma's 5s default is tight on a cold Neon compute.
  });
}

main()
  .then(async () => {
    await cleanup();
    console.log(
      failures === 0
        ? `\n✓ VINEYARD-1 holds against a real database (${checks} checks).\n`
        : `\n✗ VINEYARD-1: ${failures} of ${checks} checks FAILED.\n`,
    );
    await disconnectSystem();
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error("\n✗ VINEYARD-1 runtime proof ERRORED:", e);
    // Still clean up — a half-created fixture tenant would break the next run's unique slug.
    await cleanup().catch((ce) => console.error("  (cleanup also failed:", ce, ")"));
    await disconnectSystem();
    await prisma.$disconnect();
    process.exit(1);
  });
