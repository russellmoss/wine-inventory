/**
 * GROUP-1 guard — a vessel belongs to AT MOST ONE `OPERATIONAL` barrel group (plan 106, Unit 9).
 *
 * Without it the same barrel can be scheduled into two competing topping rounds and double-topped.
 * `AD_HOC` membership is unbounded and may overlap freely, so this checks OPERATIONAL only.
 *
 * WHY THIS SCRIPT EXISTS RATHER THAN POINTING `verify:` AT `verify:barrel-groups`. That script is
 * real and green, but it covers fan-out, merge, preview and batch correction — it proves NONE of
 * GROUP-1. And `verify:invariants` only checks that the named npm script EXISTS; it never runs it.
 * So aiming GROUP-1 at an unrelated green script would have gone green while proving nothing, which
 * is the exact failure plan 106 F12 names.
 *
 * TWO CHECKS, because the invariant has two halves and only one of them is data:
 *   1. DATA — sweep every tenant for a vessel sitting in two OPERATIONAL groups.
 *   2. STRUCTURE — assert the partial unique index and BOTH triggers still exist. The denormalised
 *      `groupType` column is what the index is partial ON, and it is only trustworthy because
 *      triggers own it. Drop a trigger and the data check would keep passing right up until the
 *      first application write lied about a group's type.
 *
 * Reads via runAsSystem: these tables are RLS-protected, so a pooled app_rls client with no tenant
 * GUC returns ZERO rows and this would report a false clean.
 *
 * Run:  npm run verify:group-membership
 */
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";

type ConflictRow = {
  tenantId: string;
  vesselCode: string;
  groupNames: string;
  groupCount: string;
};

type ObjectRow = { name: string; kind: string };

const REQUIRED_OBJECTS: { name: string; kind: string; why: string }[] = [
  {
    name: "vessel_group_member_one_operational_group_per_vessel",
    kind: "index",
    why: "the partial unique index IS the enforcement — without it GROUP-1 is a comment",
  },
  {
    name: "vessel_group_member_sync_type_trg",
    kind: "trigger",
    why: "overwrites a caller-supplied groupType with the group's real type; without it an app write can smuggle a member in or out of the index",
  },
  {
    name: "vessel_group_propagate_type_trg",
    kind: "trigger",
    why: "propagates a group retype to its members; without it the index is enforced against a stale type",
  },
];

async function main() {
  const { conflicts, objects, memberCount, tenantCount } = await runAsSystem(async (db) => {
    const conflicts = await db.$queryRawUnsafe<ConflictRow[]>(`
      SELECT m."tenantId"                              AS "tenantId",
             v.code                                    AS "vesselCode",
             string_agg(g.name, ', ' ORDER BY g.name)  AS "groupNames",
             count(*)::text                            AS "groupCount"
      FROM vessel_group_member m
      JOIN vessel       v ON v.id = m."vesselId"
      JOIN vessel_group g ON g.id = m."groupId"
      WHERE m."groupType" = 'OPERATIONAL'
      GROUP BY m."tenantId", m."vesselId", v.code
      HAVING count(*) > 1
      ORDER BY m."tenantId", v.code
    `);

    const objects = await db.$queryRawUnsafe<ObjectRow[]>(`
      SELECT indexname AS name, 'index' AS kind FROM pg_indexes WHERE schemaname = 'public'
      UNION ALL
      SELECT tgname    AS name, 'trigger' AS kind FROM pg_trigger WHERE NOT tgisinternal
    `);

    const [{ count: memberCount }] = await db.$queryRawUnsafe<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM vessel_group_member`,
    );
    const [{ count: tenantCount }] = await db.$queryRawUnsafe<{ count: string }[]>(
      `SELECT count(DISTINCT "tenantId")::text AS count FROM vessel_group`,
    );
    return { conflicts, objects, memberCount, tenantCount };
  });

  let failed = false;

  // ── 1) structure ──
  const present = new Set(objects.map((o) => `${o.kind}:${o.name}`));
  for (const req of REQUIRED_OBJECTS) {
    if (!present.has(`${req.kind}:${req.name}`)) {
      failed = true;
      console.error(`  ✗ missing ${req.kind} "${req.name}" — ${req.why}`);
    }
  }

  // ── 2) data ──
  if (conflicts.length > 0) {
    failed = true;
    console.error("");
    for (const c of conflicts) {
      console.error(`  ✗ ${c.tenantId}: ${c.vesselCode} is in ${c.groupCount} operational groups — ${c.groupNames}`);
    }
  }

  console.log(
    `\nGROUP-1: checked ${memberCount} membership row(s) across ${tenantCount} tenant(s) with barrel groups, ` +
      `plus ${REQUIRED_OBJECTS.length} required database object(s).`,
  );

  if (failed) {
    console.error(
      `\nFAIL — GROUP-1 is not in force.\n` +
        `A vessel in two OPERATIONAL groups can be scheduled into two competing rounds and double-topped.\n` +
        `Remove the vessel from one of the groups, or make one of them AD_HOC.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("PASS — every vessel is in at most one operational barrel group, and the index + triggers are in place.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSystem();
  });
