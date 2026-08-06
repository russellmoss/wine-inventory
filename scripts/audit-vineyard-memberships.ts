/**
 * Who is locked out by VINEYARD-1? — a READ-ONLY audit.
 *
 * WHY THIS EXISTS, urgently. VINEYARD-1 is live: every vineyard-scoped action now applies D9, and D9
 * FAILS CLOSED. A non-admin with no `user_vineyard` row reaches NOTHING — not weather, not spray, not
 * soil, not NDVI, not block editing. That is the correct and intended direction (plan 092 requires an
 * unseeded user to resolve to the empty set rather than to see-all), but it means the fence has real
 * blast radius the moment it deploys, and the security register notes the live database held only ONE
 * `user_vineyard` row when it was written.
 *
 * GLOBAL-1 compounds it from the other side: catalog writes (varieties, locations, vessels, finished
 * goods) are now admin-only, so a `role: "user"` account has lost those too.
 *
 * This script answers the one question that matters before anyone panics: **is anybody actually
 * affected?** It may well report zero — if every real account is `admin` or `developer`, both fences are
 * no-ops in practice and there is nothing to do.
 *
 * DELIBERATELY READ-ONLY. It does not grant anything. Which manager should reach which vineyard is a
 * business decision, not something a script should infer — and a bulk "give everyone everything" grant
 * would quietly undo the fence it is meant to support. Remediation is the admin Users page (the
 * checkboxes there call `setUserVineyards`), or a targeted grant once you know who needs what.
 *
 * ⚠️ `setUserVineyards` REPLACES a user's whole set rather than adding to it (see the security register's
 * 2026-07-26 entry, where that plus an empty read caused silent data loss). So when you do assign, tick
 * every vineyard that user should have, not just the new one.
 *
 * Reads through `runAsSystem` (the owner role): `user_vineyard` is RLS-forced, so a pooled app_rls client
 * with no tenant GUC returns zero rows and this would report a false "everyone is locked out".
 *
 * Run:  npm run audit:vineyard-memberships
 */
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";

type Row = {
  orgId: string;
  orgName: string;
  userId: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  vineyardCount: bigint;
};

/** Admin and developer bypass D9 entirely — `isTenantAdminLike` short-circuits before the membership set. */
const BYPASSES_D9 = (role: string | null) => role === "admin" || role === "developer";

async function main(): Promise<number> {
  const rows = await runAsSystem((db) =>
    db.$queryRaw<Row[]>`
      SELECT o."id"                                   AS "orgId",
             o."name"                                 AS "orgName",
             u."id"                                   AS "userId",
             u."email"                                AS "email",
             u."role"                                 AS "role",
             u."banned"                               AS "banned",
             (SELECT COUNT(*) FROM "user_vineyard" uv
               WHERE uv."userId" = u."id" AND uv."tenantId" = o."id") AS "vineyardCount"
        FROM "member" m
        JOIN "user" u         ON u."id" = m."userId"
        JOIN "organization" o ON o."id" = m."organizationId"
       ORDER BY o."name", u."email"`,
  );

  if (rows.length === 0) {
    console.log("\nNo org memberships at all — nothing to audit.\n");
    return 0;
  }

  const vineyardTotals = await runAsSystem((db) =>
    db.$queryRaw<{ tenantId: string; n: bigint }[]>`
      SELECT "tenantId", COUNT(*) AS n FROM "vineyard" GROUP BY "tenantId"`,
  );
  const vineyardsIn = new Map(vineyardTotals.map((v) => [v.tenantId, Number(v.n)]));

  const byOrg = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byOrg.get(r.orgId) ?? [];
    list.push(r);
    byOrg.set(r.orgId, list);
  }

  const lockedOut: Row[] = [];
  const partiallyScoped: Row[] = [];

  console.log("\nVINEYARD-1 / GLOBAL-1 blast radius\n");

  for (const [orgId, users] of byOrg) {
    const orgName = users[0].orgName;
    const totalVineyards = vineyardsIn.get(orgId) ?? 0;
    console.log(`  ${orgName}  (${orgId})  — ${totalVineyards} vineyard(s)`);
    for (const u of users) {
      const n = Number(u.vineyardCount);
      const role = u.role ?? "user";
      const bypass = BYPASSES_D9(u.role);
      let note: string;
      if (u.banned) {
        note = "banned — cannot sign in anyway";
      } else if (bypass) {
        note = "reaches every vineyard (bypasses D9)";
      } else if (n === 0) {
        note = "⛔ LOCKED OUT of every vineyard-scoped surface";
        lockedOut.push(u);
      } else if (totalVineyards > 0 && n < totalVineyards) {
        note = `scoped to ${n} of ${totalVineyards} — intended?`;
        partiallyScoped.push(u);
      } else {
        note = `${n} vineyard(s)`;
      }
      console.log(`    ${role.padEnd(9)} ${u.email.padEnd(34)} memberships=${String(n).padEnd(3)} ${note}`);
    }
    console.log("");
  }

  console.log("─".repeat(78));
  if (lockedOut.length === 0) {
    console.log(
      "\n✓ Nobody is locked out. Every non-banned account is either admin/developer (which bypasses\n" +
        "  D9) or holds at least one vineyard membership. VINEYARD-1 and GLOBAL-1 are no-ops in practice\n" +
        "  for the current user set — no action needed.\n",
    );
  } else {
    console.log(`\n⛔ ${lockedOut.length} account(s) are LOCKED OUT of every vineyard-scoped surface:\n`);
    for (const u of lockedOut) console.log(`    ${u.email}   (${u.orgName})`);
    console.log(
      "\n  Each of these currently gets \"You can only work with your assigned vineyard.\" on weather,\n" +
        "  spray, soil, NDVI and block editing — and, being non-admin, is also refused catalog writes\n" +
        "  (varieties / locations / vessels / finished goods) by GLOBAL-1.\n" +
        "\n  Two ways to resolve, per account:\n" +
        "    - assign the vineyards they should reach (admin Users page — tick EVERY vineyard they need,\n" +
        "      because setUserVineyards REPLACES the whole set), or\n" +
        "    - promote to admin if that reflects how they actually work.\n",
    );
  }

  if (partiallyScoped.length > 0) {
    console.log(
      `  ${partiallyScoped.length} account(s) hold a PARTIAL set — that is exactly what D9 is for, but\n` +
        "  worth confirming it is deliberate rather than a half-finished assignment:\n",
    );
    for (const u of partiallyScoped) {
      console.log(`    ${u.email}  ${Number(u.vineyardCount)} of ${vineyardsIn.get(u.orgId) ?? 0}  (${u.orgName})`);
    }
    console.log("");
  }

  // Exit 0 even when accounts are locked out: this is a REPORT, not a gate. A non-zero exit would make
  // it unusable in a pipeline and implies "broken", when a locked-out account may be entirely correct.
  return 0;
}

main()
  .then(async (code) => {
    await disconnectSystem();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error("\n✗ audit errored:", e);
    await disconnectSystem();
    process.exit(1);
  });
