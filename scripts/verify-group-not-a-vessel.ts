/**
 * GROUP-2 guard — a barrel group is never a vessel and never a lot (plan 106, Unit 9).
 *
 * A `VesselGroup` holds no volume, has no capacity of its own, appears in no `LotOperationLine`, and
 * never appears in `LotLineage`. It is an operational working set, not a ledger position. This is the
 * invariant that keeps the group layer from quietly becoming a second, parallel ledger — it pairs
 * with LEDGER-12: the atomic vessel stays 1:1 with its lot, while the group above it may ASSOCIATE
 * mixed lots without ever holding them.
 *
 * DERIVED FROM `Prisma.dmmf`, NOT FROM A HAND-LIST. A hand-written list of forbidden columns is a
 * list someone has to remember to extend; the whole failure mode here is a well-meaning future
 * migration adding `volumeL` to vessel_group or `vesselGroupId` to lot_operation_line, and a
 * hand-list would not notice. Same posture as test/commerce7-schema.test.ts, which fails if a PII
 * column is ever added, and as verify-tenant-isolation's coverage guard.
 *
 * Structural, so it needs no database connection at all — it reads the datamodel. That also makes it
 * the one guard of the three that cannot report a false clean because of RLS.
 *
 * Run:  npm run verify:group-not-a-vessel
 */
import { Prisma } from "@prisma/client";

/** Models that ARE the ledger. A group must never be referenced from any of them. */
const LEDGER_MODELS = [
  "LotOperation",
  "LotOperationLine",
  "LotLineage",
  "VesselLot",
  "VesselComponent",
  "LotStateEvent",
];

/**
 * Column names that would make a group a physical thing. `VesselGroup` may describe WHERE a set of
 * barrels is and HOW it should be worked; it may never describe how much wine it contains.
 */
const PHYSICAL_FIELD = /^(volumeL|capacityL|fillL|netL|grossL|bottleCount|weightKg|abv|lotId|currentLotId)$/;

/** The membership table must stay a pure association. This is GROUP-3's corollary, checked here too. */
const FORBIDDEN_MEMBER_FIELD = /^(addedAt|removedAt|volumeL|lotId)$/;

function main() {
  const models = Prisma.dmmf.datamodel.models;
  const byName = new Map(models.map((m) => [m.name, m]));
  const violations: string[] = [];

  const group = byName.get("VesselGroup");
  const member = byName.get("VesselGroupMember");
  if (!group || !member) {
    console.error("FAIL — VesselGroup / VesselGroupMember are missing from the datamodel.");
    process.exitCode = 1;
    return;
  }

  // 1) The group carries no physical quantity of its own.
  for (const f of group.fields) {
    if (PHYSICAL_FIELD.test(f.name)) {
      violations.push(
        `VesselGroup.${f.name} — a group has no capacity and no ledger position. ` +
          `If a group needs to report a volume it must COMPUTE it from its members (RFC-001 §4.6).`,
      );
    }
  }

  // 2) The membership row stays a pure association: no volume, no lot, and no dates.
  for (const f of member.fields) {
    if (FORBIDDEN_MEMBER_FIELD.test(f.name)) {
      violations.push(
        f.name === "addedAt" || f.name === "removedAt"
          ? `VesselGroupMember.${f.name} — effective-dated membership was rejected by the owner (ADR 0014). ` +
            `This column is GROUP-3's tripwire: it means the work-order snapshot has been quietly abandoned.`
          : `VesselGroupMember.${f.name} — membership associates a vessel, it never holds wine.`,
      );
    }
  }

  // 3) No ledger model references a group, by relation OR by a bare scalar id.
  for (const name of LEDGER_MODELS) {
    const m = byName.get(name);
    if (!m) {
      violations.push(`${name} is missing from the datamodel — this guard's model list is stale.`);
      continue;
    }
    for (const f of m.fields) {
      const isRelationToGroup = f.kind === "object" && (f.type === "VesselGroup" || f.type === "VesselGroupMember");
      // The scalar check matters more than the relation check: this repo's cross-tenant FKs are
      // written in raw SQL, so a reference can exist as a plain String column with no Prisma relation.
      const isScalarGroupRef = f.kind === "scalar" && /^(vesselGroupId|groupId|vesselGroupMemberId)$/.test(f.name);
      if (isRelationToGroup || isScalarGroupRef) {
        violations.push(
          `${name}.${f.name} references a barrel group. A group action is ONE user intent fanned out to ` +
            `member VESSELS sharing LotOperation.batchId — the ledger records the vessels, never the group.`,
        );
      }
    }
  }

  // 4) The group's own relations stay confined to membership.
  const allowedGroupRelations = new Set(["members"]);
  for (const f of group.fields) {
    if (f.kind === "object" && !allowedGroupRelations.has(f.name)) {
      violations.push(
        `VesselGroup.${f.name} is a new relation (→ ${f.type}). A group associates vessels through ` +
          `\`members\` and nothing else; widening this is how the group layer becomes a parallel ledger.`,
      );
    }
  }

  console.log(
    `\nGROUP-2: checked VesselGroup (${group.fields.length} fields), VesselGroupMember ` +
      `(${member.fields.length} fields) and ${LEDGER_MODELS.length} ledger model(s), derived from Prisma.dmmf.`,
  );

  if (violations.length > 0) {
    console.error("");
    for (const v of violations) console.error(`  ✗ ${v}`);
    console.error(`\nFAIL — ${violations.length} violation(s). A barrel group is drifting toward being a vessel.`);
    process.exitCode = 1;
    return;
  }
  console.log("PASS — a barrel group holds no volume, has no ledger position, and no ledger row references one.");
}

main();
