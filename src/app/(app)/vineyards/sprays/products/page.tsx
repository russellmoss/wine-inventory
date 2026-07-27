import Link from "next/link";
import { requireReadyUser, requireActiveTenant } from "@/lib/dal";
import { Badge, Button, Eyebrow } from "@/components/ui";
import { listTenantProductFacts } from "@/lib/spray/actions";
import { TenantProductFactsForm } from "./TenantProductFactsForm";

// S2b Unit 5 — the tenant-scoped grower-supplied product-facts entry surface (rule §3.9, SAFE-19).
// A non-US tenant (or a US grower whose product our registry can't resolve) defines a product's
// facts by hand here, then cites its `productRef` on a spray record's "Custom product ref" field
// instead of an EPA registration number.
export default async function TenantProductFactsPage() {
  await requireReadyUser();
  await requireActiveTenant();
  const result = await listTenantProductFacts();

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Eyebrow rule>Spray Intelligence</Eyebrow>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: "10px 0 4px" }}>Custom products</h1>
          <p style={{ color: "var(--text-muted)", marginTop: 0, marginBottom: 16 }}>
            Grower-supplied facts for a product with no EPA registration number. Cite the reference
            below on a spray record instead of an EPA number.
          </p>
        </div>
        <Link href="/vineyards/sprays"><Button variant="secondary" size="sm">Back to spray records</Button></Link>
      </div>

      <div style={{ marginBottom: 20 }}>
        <TenantProductFactsForm />
      </div>

      {!result.ok ? (
        <p style={{ color: "var(--danger, #B63D35)" }}>{result.error}</p>
      ) : result.data.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No custom products yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 13 }}>
                <th style={{ padding: "8px 12px" }}>Reference</th>
                <th style={{ padding: "8px 12px" }}>Product</th>
                <th style={{ padding: "8px 12px" }}>Group</th>
                <th style={{ padding: "8px 12px" }}>PHI / REI</th>
                <th style={{ padding: "8px 12px" }}>Rainfast / Mobility</th>
                <th style={{ padding: "8px 12px" }}>Entered</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle, rgba(20,19,15,0.08))" }}>
                  <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono, monospace)" }}>{r.productRef}</td>
                  <td style={{ padding: "10px 12px" }}>{r.productName}</td>
                  <td style={{ padding: "10px 12px" }}><Badge tone="maroon" variant="soft">{r.factGroup === "REGULATORY" ? "grower-supplied" : "grower-supplied"}</Badge> {r.factGroup}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {r.worstCasePhiDays != null || r.worstCaseReiHours != null
                      ? `${r.worstCasePhiDays ?? "?"} d / ${r.worstCaseReiHours ?? "?"} h`
                      : "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {r.rainfastHours != null || r.mobilityClass ? `${r.rainfastHours ?? "?"} h / ${r.mobilityClass ?? "unspecified"}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{r.enteredAt.slice(0, 10)} · {r.enteredBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
