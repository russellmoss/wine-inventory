import Link from "next/link";
import { requireReadyUser, requireActiveTenant } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { Badge, Button, Eyebrow } from "@/components/ui";
import { loadSpraySeasonList } from "@/lib/spray/actions";

// S3a Unit 13 — the spray record season list. Summary-first, one nav entry (the P8 lesson).
// Honesty rendering is the point: a record whose facts are not KNOWN carries a visible
// "facts unknown" badge, distinct from a clear state (rule §3.6).
export default async function SpraysPage({ searchParams }: { searchParams: Promise<{ vineyard?: string }> }) {
  await requireReadyUser();
  await requireActiveTenant();
  const sp = await searchParams;

  const vineyards = await prisma.vineyard.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const selected = vineyards.find((v) => v.id === sp.vineyard) ?? null;
  const result = await loadSpraySeasonList(selected?.id ?? null);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <Eyebrow rule>Spray Intelligence</Eyebrow>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: "10px 0 4px" }}>Spray records</h1>
          <p style={{ color: "var(--text-muted)", marginTop: 0, marginBottom: 16 }}>
            The append-only application record. A mistake is corrected by a new revision — never an edit.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/vineyards/sprays/products"><Button variant="secondary" size="sm">Custom products</Button></Link>
          <Link href="/vineyards/sprays/planned-harvest"><Button variant="secondary" size="sm">Planned harvest</Button></Link>
          <Link href="/vineyards/sprays/new"><Button size="sm">Record a spray</Button></Link>
        </div>
      </div>

      <form method="get" style={{ marginBottom: 16 }}>
        <label htmlFor="vineyard-filter" style={{ fontSize: 14, color: "var(--text-secondary)", marginRight: 8 }}>Vineyard</label>
        <select id="vineyard-filter" name="vineyard" defaultValue={selected?.id ?? ""} style={{ padding: "6px 10px", borderRadius: "var(--radius-md, 10px)", border: "1px solid var(--border-default, #DED7C6)" }}>
          <option value="">All vineyards</option>
          {vineyards.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <Button type="submit" variant="ghost" size="sm" style={{ marginLeft: 8 }}>Apply</Button>
      </form>

      {!result.ok ? (
        <p style={{ color: "var(--danger, #B63D35)" }}>{result.error}</p>
      ) : result.data.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No spray records yet. Record the first pass to start the season history.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table tabIndex={0} style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 13 }}>
                <th style={{ padding: "8px 12px" }}>Started</th>
                <th style={{ padding: "8px 12px" }}>Vineyard</th>
                <th style={{ padding: "8px 12px" }}>Materials</th>
                <th style={{ padding: "8px 12px" }}>Blocks</th>
                <th style={{ padding: "8px 12px" }}>Method</th>
                <th style={{ padding: "8px 12px" }}>Facts</th>
                <th style={{ padding: "8px 12px" }} />
              </tr>
            </thead>
            <tbody>
              {result.data.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle, rgba(20,19,15,0.08))" }}>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{r.startedAt.toISOString().slice(0, 10)}</td>
                  <td style={{ padding: "10px 12px" }}>{r.vineyardName}</td>
                  <td style={{ padding: "10px 12px" }}>{r.materialSummary}</td>
                  <td style={{ padding: "10px 12px" }}>{r.blockCount}</td>
                  <td style={{ padding: "10px 12px" }}>{r.applicationMethod}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {r.factsUnknownCount > 0 ? (
                      <Badge tone="maroon" variant="outline">facts unknown ×{r.factsUnknownCount}</Badge>
                    ) : (
                      <Badge tone="green" variant="soft">known</Badge>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Link href={`/vineyards/sprays/${r.id}`} style={{ color: "var(--accent, #722F37)" }}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
