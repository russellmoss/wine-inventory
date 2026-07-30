import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveTenant, requireReadyUser, isTenantAdminLike } from "@/lib/dal";
import { HubSectionNav } from "@/components/nav/HubSectionNav";
import { PageHeader, Card, EmptyState, StatusChip, Badge } from "@/components/ui";
import { getGroupRollupsCore, listGroupDetailsCore, type GroupRollups } from "@/lib/vessels/group-core";
import { Rollup } from "./Rollup";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Barrel groups" };

// SC-09 — the barrel-group index. RFC-001: "define how this set of barrels gets worked."
//
// PERMISSIONS (D7 / §4.10). This page must NOT turn a non-admin away. Viewing groups and members is
// open to every authenticated user in the tenant; only create/rename/archive/settings/membership are
// admin, and those are gated on the ACTIONS (safeAdminAction) with the controls hidden here. A 404
// for a cellar hand would take away the only way to see what a rack contains — and the nav item is
// deliberately unflagged, which test/nav-section-guards.test.ts holds this page to.
//
// COPY RULE: never the bare word "group" near anything work-order shaped. In the work-order builder
// "group" means `groupSeq` — parallel TASK groups — and the two are unrelated. Always "barrel group".

/** A group's status is a two-value ramp, so it maps onto the six-value vocabulary, not its own colours. */
function statusChip(status: "ACTIVE" | "ARCHIVED") {
  return status === "ACTIVE" ? (
    <StatusChip variant="active">Active</StatusChip>
  ) : (
    <StatusChip variant="neutral">Archived</StatusChip>
  );
}

/**
 * SC-09 Partial state. A group whose members span two lots is LEGAL — work orders fan out per wine.
 * It is a warning row, never an error, and the copy has to say so or a manager will "fix" it.
 */
function twoWinesNote(rollups: GroupRollups) {
  if (rollups.distinctLotCount < 2) return null;
  return (
    <p
      style={{
        margin: "8px 0 0",
        fontSize: 13.5,
        color: "var(--text-secondary)",
        borderLeft: "3px solid var(--border-strong)",
        paddingLeft: 10,
      }}
    >
      This barrel group holds {rollups.distinctLotCount} wines ({rollups.lotCodes.join(", ")}). Work orders will fan
      out per wine.
    </p>
  );
}

export default async function BarrelGroupsPage() {
  // requireActiveTenant resolves `supportOrganizationId ?? activeOrganizationId` and redirects when
  // neither is set. A hand-rolled `!user.activeOrganizationId` check is blind to a support session
  // and would dead-end a developer on a page that works fine.
  await requireActiveTenant();
  const isAdmin = isTenantAdminLike(await requireReadyUser());

  const groups = await listGroupDetailsCore({ status: "ALL" });
  const rollups = new Map<string, GroupRollups>(
    await Promise.all(groups.map(async (g) => [g.id, await getGroupRollupsCore(g.id)] as const)),
  );

  const active = groups.filter((g) => g.status === "ACTIVE");
  const archived = groups.filter((g) => g.status === "ARCHIVED");

  return (
    <>
      <HubSectionNav hub="/bulk" current="/cellar/groups" />
      <PageHeader
        title="Barrel groups"
        summary={
          groups.length === 0
            ? undefined
            : `${active.length} active ${active.length === 1 ? "group" : "groups"}${archived.length ? `, ${archived.length} archived` : ""}.`
        }
        meta={
          isAdmin ? null : (
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
              You can view groups and record work against them. An admin defines them.
            </span>
          )
        }
      />

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            title="No barrel groups yet"
            actions={
              <Link
                href="/bulk"
                style={{
                  color: "var(--text-accent)",
                  minHeight: "var(--touch-min)",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {isAdmin ? "Create one from the cellar floor" : "Go to the cellar floor"}
              </Link>
            }
          >
            A barrel group is how work gets assigned — most wineries start with one per rack. Select the barrels on
            the cellar floor and save the selection as a group.
          </EmptyState>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          {[...active, ...archived].map((g) => {
            const r = rollups.get(g.id)!;
            return (
              <Card key={g.id}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
                  <Link
                    href={`/cellar/groups/${g.id}`}
                    style={{
                      fontSize: 17,
                      fontWeight: 600,
                      color: "var(--text-accent)",
                      minHeight: "var(--touch-min)",
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    {g.name}
                  </Link>
                  {statusChip(g.status)}
                  {/* Badge for the CATEGORY, StatusChip for the status ramp — never the reverse. */}
                  <Badge>{g.type === "OPERATIONAL" ? "Operational" : "Ad hoc"}</Badge>
                  {g.locationName || g.rackLabel ? (
                    <span style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
                      {[g.locationName, g.rackLabel].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </div>

                <dl
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: "var(--space-3)",
                    margin: "12px 0 0",
                  }}
                >
                  <Rollup label="Barrels" value={String(r.memberCount)} />
                  <Rollup label="Wines" value={r.distinctLotCount === 0 ? "—" : String(r.distinctLotCount)} />
                  {/* DESIGN.md: a group's volume is a SUM OF DERIVED barrel volumes, not a
                      measurement, so it is always "≈ estimated" and never "measured". */}
                  <Rollup label="Volume" value={r.volumeL === 0 ? "—" : `≈ ${r.volumeL.toLocaleString()} L`} derivation="estimated" />
                  <Rollup
                    label="Oldest topped"
                    value={
                      r.memberCount === 0
                        ? "—"
                        : r.oldestLastToppedAt
                          ? new Date(r.oldestLastToppedAt).toLocaleDateString()
                          : "Never"
                    }
                    // Absence and staleness are different facts and must not collapse into one.
                    derivation={r.neverToppedCount > 0 && r.memberCount > 0 ? `${r.neverToppedCount} never topped` : undefined}
                  />
                  <Rollup label="Open work orders" value={String(r.openWorkOrderCount)} />
                </dl>

                {twoWinesNote(r)}
                {g.members.length === 0 ? (
                  <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "var(--text-secondary)" }}>
                    No barrels in this group yet. A work order can&apos;t be issued against an empty group.
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
