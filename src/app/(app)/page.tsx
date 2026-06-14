import { requireReadyUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { casesAndLoose } from "@/lib/bottling/draw";
import { Card, Eyebrow, Metric, Badge } from "@/components/ui";

export default async function DashboardPage() {
  const user = await requireReadyUser();

  const [bulk, bottled, goods, recent] = await Promise.all([
    prisma.vesselComponent.aggregate({ _sum: { volumeL: true } }),
    prisma.bottledInventory.aggregate({ _sum: { totalBottles: true } }),
    prisma.finishedGoodInventory.aggregate({ _sum: { quantity: true } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  const bulkL = Math.round(Number(bulk._sum.volumeL ?? 0) * 100) / 100;
  const totalBottles = bottled._sum.totalBottles ?? 0;
  const { cases, loose } = casesAndLoose(totalBottles);
  const goodsQty = goods._sum.quantity ?? 0;

  return (
    <div>
      <Eyebrow rule>Dashboard</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 40, margin: "10px 0 4px" }}>
        Welcome{user.name ? `, ${user.name}` : ""}
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 28 }}>Bhutan Wine Company inventory at a glance.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 32 }}>
        <Card><Metric value={bulkL.toLocaleString()} caption="Litres of bulk wine at the winery" /></Card>
        <Card><Metric value={cases.toLocaleString()} caption={`Bottled cases (+${loose} loose)`} /></Card>
        <Card><Metric value={totalBottles.toLocaleString()} caption="Total bottles" serif /></Card>
        <Card><Metric value={goodsQty.toLocaleString()} caption="Finished goods on hand" /></Card>
      </div>

      <Eyebrow rule>Recent activity</Eyebrow>
      <Card padding="0" style={{ marginTop: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <tbody>
            {recent.length === 0 ? (
              <tr><td style={{ padding: "16px", color: "var(--text-muted)" }}>No activity yet. Start by adding vessels and varieties.</td></tr>
            ) : (
              recent.map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid var(--border-strong)" }}>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "var(--text-muted)", width: 130 }}>
                    {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td style={{ padding: "10px 14px" }}>{e.summary}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    <Badge tone="neutral" variant="soft">{e.actorEmail}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
