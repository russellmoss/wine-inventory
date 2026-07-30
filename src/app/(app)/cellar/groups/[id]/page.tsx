import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireReadyUser, isTenantAdminLike } from "@/lib/dal";
import { PageHeader, Card, EmptyState, StatusChip, Badge, ResponsiveTable, DataRow, DataCell, DataHeadCell } from "@/components/ui";
import { getGroupDetailCore, getGroupRollupsCore } from "@/lib/vessels/group-core";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Barrel group" };

// SC-09 detail. Deliberately carries NO SectionNav and there is no layout.tsx under this segment:
// the section strip belongs to the section page (/cellar/groups), and a nested route repeating it
// would claim the href twice — which the orphan guard reads as two sources for one destination.
//
// Open to every ready user (§4.10). Admin-only capability is surfaced as a note, not by 404.

const MEMBER_PREVIEW = 12;

export default async function BarrelGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireReadyUser();
  if (!user.activeOrganizationId) {
    return <div style={{ padding: 24 }}>Your account isn&apos;t attached to a winery.</div>;
  }
  const isAdmin = isTenantAdminLike(user);

  const group = await getGroupDetailCore(id);
  if (!group) notFound();
  const rollups = await getGroupRollupsCore(id);

  const shown = group.members.slice(0, MEMBER_PREVIEW);
  const overflow = group.members.length - shown.length;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Cellar floor", href: "/bulk" },
          { label: "Barrel groups", href: "/cellar/groups" },
          { label: group.name },
        ]}
        title={group.name}
        summary={
          rollups.memberCount === 0
            ? "This barrel group has no barrels in it yet."
            : `${rollups.memberCount} ${rollups.memberCount === 1 ? "barrel" : "barrels"}${
                rollups.distinctLotCount > 0
                  ? `, ${rollups.distinctLotCount} ${rollups.distinctLotCount === 1 ? "wine" : "wines"}`
                  : ""
              }.`
        }
        meta={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {group.status === "ACTIVE" ? (
              <StatusChip variant="active">Active</StatusChip>
            ) : (
              <StatusChip variant="neutral">Archived</StatusChip>
            )}
            <Badge>{group.type === "OPERATIONAL" ? "Operational" : "Ad hoc"}</Badge>
            {group.locationName || group.rackLabel ? (
              <span style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
                {[group.locationName, group.rackLabel].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </span>
        }
      />

      {group.status === "ARCHIVED" ? (
        <Card style={{ marginBottom: "var(--space-4)" }}>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>
            This barrel group is archived. It stays out of pickers and keeps all its history. Open work orders that
            use it are unaffected — their barrel lists were frozen when they were issued.
          </p>
        </Card>
      ) : null}

      {/* SC-09 Partial: legal, not an error. Say so, or a manager will try to "fix" it. */}
      {rollups.distinctLotCount >= 2 ? (
        <Card style={{ marginBottom: "var(--space-4)" }}>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>
            This barrel group holds {rollups.distinctLotCount} wines ({rollups.lotCodes.join(", ")}). Work orders will
            fan out per wine. That is expected — a group associates barrels, it never merges their wine.
          </p>
        </Card>
      ) : null}

      <Card style={{ marginBottom: "var(--space-4)" }}>
        <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Rollups</h2>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--space-3)", margin: 0 }}>
          <Rollup label="Barrels" value={String(rollups.memberCount)} derivation="counted members" />
          <Rollup
            label="Volume"
            value={rollups.volumeL === 0 ? "—" : `≈ ${rollups.volumeL.toLocaleString()} L`}
            // RFC-001 §4.6 / AC-10: every rollup states its derivation, because a group's volume is a
            // SUM OF DERIVED barrel volumes and is never a measurement.
            derivation="estimated — sum of derived barrel volumes"
          />
          <Rollup
            label="Capacity"
            value={rollups.capacityL === 0 ? "—" : `${rollups.capacityL.toLocaleString()} L`}
            derivation="sum of vessel capacities"
          />
          <Rollup
            label="Wines"
            value={rollups.distinctLotCount === 0 ? "—" : String(rollups.distinctLotCount)}
            derivation={rollups.lotCodes.length ? rollups.lotCodes.join(", ") : "no wine in these barrels"}
          />
          <Rollup
            label="Oldest topped"
            value={
              rollups.memberCount === 0 ? "—" : rollups.oldestLastToppedAt ? new Date(rollups.oldestLastToppedAt).toLocaleDateString() : "Never"
            }
            derivation={
              rollups.neverToppedCount > 0 && rollups.memberCount > 0
                ? `${rollups.neverToppedCount} of ${rollups.memberCount} have never been topped`
                : "oldest last-topping across members"
            }
          />
          <Rollup label="Open work orders" value={String(rollups.openWorkOrderCount)} derivation="draft, issued or in progress" />
        </dl>
      </Card>

      <Card>
        <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Members</h2>
        {group.members.length === 0 ? (
          <EmptyState
            title="No barrels in this group"
            actions={
              <Link
                href="/bulk"
                style={{ color: "var(--text-accent)", minHeight: "var(--touch-min)", display: "inline-flex", alignItems: "center" }}
              >
                {isAdmin ? "Add barrels from the cellar floor" : "Go to the cellar floor"}
              </Link>
            }
          >
            A work order can&apos;t be issued against an empty barrel group — it would produce a worksheet covering
            nothing.
          </EmptyState>
        ) : (
          <>
            {/* `stack`, not `scroll`: each row is an object (a barrel), not a cell in a matrix. */}
            <ResponsiveTable caption={`Barrels in ${group.name}, in walk order`} transform="stack">
              <thead>
                <tr>
                  <DataHeadCell>#</DataHeadCell>
                  <DataHeadCell>Vessel</DataHeadCell>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  <DataRow key={m.id}>
                    <DataCell>{m.position}</DataCell>
                    <DataCell>{m.label}</DataCell>
                  </DataRow>
                ))}
              </tbody>
            </ResponsiveTable>
            {overflow > 0 ? (
              <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--text-muted)" }}>
                +{overflow} more {overflow === 1 ? "barrel" : "barrels"} in this group.
              </p>
            ) : null}
          </>
        )}
        {!isAdmin ? (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            An admin edits membership and settings. You can record work against this group from the cellar floor.
          </p>
        ) : null}
      </Card>
    </>
  );
}

function Rollup({ label, value, derivation }: { label: string; value: string; derivation: string }) {
  return (
    <div>
      <dt style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
        {label}
      </dt>
      <dd style={{ margin: "2px 0 0", fontSize: 15, color: "var(--text-primary)" }}>{value}</dd>
      <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{derivation}</p>
    </div>
  );
}
