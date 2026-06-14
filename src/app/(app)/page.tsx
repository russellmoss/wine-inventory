import { requireReadyUser } from "@/lib/dal";
import { Card, Eyebrow, Metric, Badge } from "@/components/ui";

export default async function DashboardPage() {
  const user = await requireReadyUser();

  return (
    <div>
      <Eyebrow rule>Dashboard</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 40, margin: "10px 0 4px" }}>
        Welcome{user.name ? `, ${user.name}` : ""}
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 28 }}>
        Bhutan Wine Company inventory. Live metrics arrive as the inventory modules ship.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        <Card>
          <Metric value="—" caption="Bulk wine at the winery (L)" />
        </Card>
        <Card>
          <Metric value="—" caption="Bottled cases" />
        </Card>
        <Card>
          <Metric value="—" caption="Finished-good SKUs" />
        </Card>
      </div>

      <div style={{ marginTop: 28 }}>
        <Badge tone="gold" variant="soft">
          Milestone A — foundation
        </Badge>
      </div>
    </div>
  );
}
