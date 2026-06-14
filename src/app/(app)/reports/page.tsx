import { prisma } from "@/lib/prisma";
import { classifyBlend } from "@/lib/bulk/blend";
import { casesAndLoose } from "@/lib/bottling/draw";
import { Card, Eyebrow, Badge, ExportCsvButton } from "@/components/ui";

const sectionHead: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 };
const h2Style: React.CSSProperties = { fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 24, margin: 0 };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function bulkByVariety() {
  const vessels = await prisma.vessel.findMany({
    where: { isActive: true },
    include: { components: { include: { variety: { select: { name: true } } } } },
  });
  const map = new Map<string, { unblendedL: number; blendedL: number }>();
  for (const v of vessels) {
    const comps = v.components.map((c) => ({ varietyId: c.varietyId, varietyName: c.variety.name, volumeL: Number(c.volumeL) }));
    const info = classifyBlend(comps);
    for (const c of comps) {
      const e = map.get(c.varietyName) ?? { unblendedL: 0, blendedL: 0 };
      if (info.isBlend) e.blendedL = round2(e.blendedL + c.volumeL);
      else e.unblendedL = round2(e.unblendedL + c.volumeL);
      map.set(c.varietyName, e);
    }
  }
  return [...map.entries()]
    .map(([variety, v]) => ({ variety, ...v, totalL: round2(v.unblendedL + v.blendedL) }))
    .sort((a, b) => b.totalL - a.totalL);
}

async function bottledBySkuLocation() {
  const rows = await prisma.bottledInventory.findMany({
    where: { totalBottles: { gt: 0 } },
    include: { wineSku: { select: { name: true, vintage: true } }, location: { select: { name: true } } },
    orderBy: [{ wineSku: { name: "asc" } }],
  });
  return rows.map((r) => ({ sku: `${r.wineSku.name} ${r.wineSku.vintage}`, location: r.location.name, ...casesAndLoose(r.totalBottles), total: r.totalBottles }));
}

async function finishedByCategoryLocation() {
  const rows = await prisma.finishedGoodInventory.findMany({
    where: { quantity: { gt: 0 } },
    include: { finishedGood: { select: { name: true, category: { select: { name: true } } } }, location: { select: { name: true } } },
  });
  return rows
    .map((r) => ({ category: r.finishedGood.category.name, item: r.finishedGood.name, location: r.location.name, quantity: r.quantity }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.item.localeCompare(b.item));
}

const th: React.CSSProperties = { padding: "10px 14px", fontWeight: 500, textAlign: "left", color: "var(--text-muted)" };
const td: React.CSSProperties = { padding: "10px 14px", borderTop: "1px solid var(--border-strong)" };

export default async function ReportsPage() {
  const [bulk, bottled, finished] = await Promise.all([bulkByVariety(), bottledBySkuLocation(), finishedByCategoryLocation()]);

  return (
    <div>
      <Eyebrow rule>Reports</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 24px" }}>Inventory reports</h1>

      <section style={{ marginBottom: 36 }}>
        <div style={sectionHead}>
          <h2 style={h2Style}>Bulk wine by variety</h2>
          <ExportCsvButton filename="bulk-by-variety.csv" columns={[{ key: "variety", label: "Variety" }, { key: "unblendedL", label: "Unblended (L)" }, { key: "blendedL", label: "In blends (L)" }, { key: "totalL", label: "Total (L)" }]} rows={bulk} />
        </div>
        <Card padding="0">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5 }}>
            <thead><tr><th style={th}>Variety</th><th style={{ ...th, textAlign: "right" }}>Unblended (L)</th><th style={{ ...th, textAlign: "right" }}>In blends (L)</th><th style={{ ...th, textAlign: "right" }}>Total (L)</th></tr></thead>
            <tbody>
              {bulk.length === 0 ? <tr><td style={td} colSpan={4}>No bulk wine.</td></tr> :
                bulk.map((r) => (
                  <tr key={r.variety}>
                    <td style={td}>{r.variety}</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.unblendedL}</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.blendedL}</td>
                    <td style={{ ...td, textAlign: "right" }}><strong>{r.totalL}</strong></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section style={{ marginBottom: 36 }}>
        <div style={sectionHead}>
          <h2 style={h2Style}>Bottled wine by SKU &amp; location</h2>
          <ExportCsvButton filename="bottled-by-location.csv" columns={[{ key: "sku", label: "SKU" }, { key: "location", label: "Location" }, { key: "cases", label: "Cases" }, { key: "loose", label: "Loose bottles" }, { key: "total", label: "Total bottles" }]} rows={bottled} />
        </div>
        <Card padding="0">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5 }}>
            <thead><tr><th style={th}>SKU</th><th style={th}>Location</th><th style={{ ...th, textAlign: "right" }}>Cases + loose</th><th style={{ ...th, textAlign: "right" }}>Bottles</th></tr></thead>
            <tbody>
              {bottled.length === 0 ? <tr><td style={td} colSpan={4}>No bottled stock.</td></tr> :
                bottled.map((r, i) => (
                  <tr key={i}>
                    <td style={td}>{r.sku}</td><td style={td}>{r.location}</td>
                    <td style={{ ...td, textAlign: "right" }}><Badge tone="gold" variant="soft">{r.cases}c + {r.loose}</Badge></td>
                    <td style={{ ...td, textAlign: "right" }}>{r.total}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section style={{ marginBottom: 12 }}>
        <div style={sectionHead}>
          <h2 style={h2Style}>Finished goods by category &amp; location</h2>
          <ExportCsvButton filename="finished-goods-by-location.csv" columns={[{ key: "category", label: "Category" }, { key: "item", label: "Item" }, { key: "location", label: "Location" }, { key: "quantity", label: "Quantity" }]} rows={finished} />
        </div>
        <Card padding="0">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5 }}>
            <thead><tr><th style={th}>Category</th><th style={th}>Item</th><th style={th}>Location</th><th style={{ ...th, textAlign: "right" }}>Qty</th></tr></thead>
            <tbody>
              {finished.length === 0 ? <tr><td style={td} colSpan={4}>No finished goods.</td></tr> :
                finished.map((r, i) => (
                  <tr key={i}>
                    <td style={td}><Badge tone="blue" variant="soft">{r.category}</Badge></td>
                    <td style={td}>{r.item}</td><td style={td}>{r.location}</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.quantity}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
