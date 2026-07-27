import Link from "next/link";
import { requireReadyUser, requireActiveTenant } from "@/lib/dal";
import { Badge, Button, Card, Eyebrow } from "@/components/ui";
import { loadSprayDetail } from "@/lib/spray/actions";

// S3a Unit 13 — the spray record detail: header → materials → mixing order → blocks.
// HONESTY RENDERING IS THE POINT of this surface (rule §3.6 / §3.5):
//  - factsCompleteness UNKNOWN renders as a distinct "unknown" state, never blends with clear;
//  - driedBeforeRain null renders "not determined", never "no";
//  - a derived value is labelled derived; an override is labelled with who overrode it;
//  - a superseded revision is reachable and labelled, its successor linked (the audit trail
//    has to be visible to be worth anything).

const dtf = (d: Date | null) => (d ? d.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—");

function FactsBadge({ completeness }: { completeness: string }) {
  if (completeness === "KNOWN") return <Badge tone="green" variant="soft">facts known</Badge>;
  if (completeness === "PARTIAL") return <Badge tone="gold" variant="outline">facts partial</Badge>;
  return <Badge tone="maroon" variant="outline">facts unknown</Badge>;
}

export default async function SprayDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireReadyUser();
  await requireActiveTenant();
  const { id } = await params;
  const result = await loadSprayDetail(id);
  if (!result.ok) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--danger, #B63D35)" }}>{result.error}</p>
        <Link href="/vineyards/sprays">Back to spray records</Link>
      </div>
    );
  }
  const { application: app, correctability, chain, materials, mixOrder, blocks } = result.data;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <Eyebrow rule>Spray record</Eyebrow>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, margin: "10px 0 4px" }}>
          Pass on {app.startedAt.toISOString().slice(0, 10)} · revision {app.revision}
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {app.status === "ACTIVE" ? <Badge tone="green" variant="soft">current</Badge> : null}
          {app.status === "SUPERSEDED" ? <Badge tone="gold" variant="outline">superseded</Badge> : null}
          {app.status === "VOIDED" ? <Badge tone="red" variant="outline">voided</Badge> : null}
          {correctability.correctable ? (
            <Link href={`/vineyards/sprays/${app.id}/correct`}><Button variant="secondary" size="sm">Correct</Button></Link>
          ) : (
            <span title={correctability.correctable ? "" : correctability.reason} style={{ fontSize: 13, color: "var(--text-muted)" }}>
              not correctable — {correctability.correctable ? "" : correctability.code}
            </span>
          )}
        </div>
      </div>

      {chain.length > 1 ? (
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Revision chain:{" "}
          {chain.map((c, i) => (
            <span key={c.id}>
              {i > 0 ? " → " : ""}
              {c.id === app.id ? (
                <strong>v{c.revision} ({c.status.toLowerCase()}{c.correctionKind ? `, ${c.correctionKind.toLowerCase()}` : ""})</strong>
              ) : (
                <Link href={`/vineyards/sprays/${c.id}`} style={{ color: "var(--accent, #722F37)" }}>
                  v{c.revision} ({c.status.toLowerCase()}{c.correctionKind ? `, ${c.correctionKind.toLowerCase()}` : ""})
                </Link>
              )}
            </span>
          ))}
        </p>
      ) : null}
      {app.correctionReason ? (
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Correction reason: {app.correctionReason}</p>
      ) : null}

      <Card style={{ marginTop: 12, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Header</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, fontSize: 14 }}>
          <div><span style={{ color: "var(--text-muted)" }}>Applicator</span><br />{app.applicatorName}{app.applicatorLicense ? ` · lic. ${app.applicatorLicense}` : ""}</div>
          <div><span style={{ color: "var(--text-muted)" }}>Method</span><br />{app.applicationMethod}</div>
          <div><span style={{ color: "var(--text-muted)" }}>Started / finished</span><br />{dtf(app.startedAt)} → {dtf(app.finishedAt)}</div>
          <div><span style={{ color: "var(--text-muted)" }}>Target pest</span><br />{app.targetPest ?? "—"}</div>
          <div><span style={{ color: "var(--text-muted)" }}>Spray volume</span><br />{app.sprayVolumePerHaL != null ? `${app.sprayVolumePerHaL} L/ha` : "—"}</div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>Weather at application</span><br />
            {app.windDirection || app.windSpeedKph != null || app.airTempC != null
              ? `${app.windDirection ?? "wind ?"}${app.windSpeedKph != null ? ` ${app.windSpeedKph} kph` : ""}${app.airTempC != null ? ` · ${app.airTempC} °C` : ""}${app.weatherSource ? ` (${app.weatherSource.toLowerCase().replace(/_/g, " ")})` : ""}`
              : "not recorded"}
          </div>
          <div><span style={{ color: "var(--text-muted)" }}>Entered</span><br />{app.enteredByEmail} · {dtf(app.enteredAt)}</div>
        </div>
        {app.notes ? <p style={{ fontSize: 14, marginBottom: 0 }}>{app.notes}</p> : null}
      </Card>

      <Card style={{ marginTop: 12, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Materials</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 13 }}>
                <th style={{ padding: "6px 10px" }}>#</th>
                <th style={{ padding: "6px 10px" }}>Product</th>
                <th style={{ padding: "6px 10px" }}>EPA reg.</th>
                <th style={{ padding: "6px 10px" }}>Quantity (as entered)</th>
                <th style={{ padding: "6px 10px" }}>Basis</th>
                <th style={{ padding: "6px 10px" }}>REI / PHI</th>
                <th style={{ padding: "6px 10px" }}>Resistance groups</th>
                <th style={{ padding: "6px 10px" }}>Facts</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id} style={{ borderTop: "1px solid var(--border-subtle, rgba(20,19,15,0.08))" }}>
                  <td style={{ padding: "8px 10px" }}>{m.lineNo}</td>
                  <td style={{ padding: "8px 10px" }}>{m.productName}{m.materialRole !== "PESTICIDE" ? ` (${m.materialRole.toLowerCase()})` : ""}</td>
                  <td style={{ padding: "8px 10px" }}>{m.epaRegistrationNumber ?? "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{m.quantityEntered} {m.quantityUnit}</td>
                  <td style={{ padding: "8px 10px" }}>{m.quantityBasis.toLowerCase().replace(/_/g, " ")}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {m.snapshotReiHours ?? m.enteredReiHours ?? "?"} h / {m.snapshotPhiDays ?? m.enteredPhiDays ?? "?"} d
                    {m.snapshotReiHours == null && m.enteredReiHours != null ? <span style={{ color: "var(--text-muted)" }}> (as written)</span> : null}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    {m.resistanceGroupsKnown && m.snapshotResistanceGroups.length ? (
                      m.snapshotResistanceGroups.join(", ")
                    ) : (
                      <span style={{ color: "var(--maroon, #6B484D)", fontStyle: "italic" }}>unknown — not determined</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px" }}><FactsBadge completeness={m.factsCompleteness} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 0 }}>
          Facts are frozen as-of entry ({materials[0]?.factsAsOf ? dtf(materials[0].factsAsOf) : "no registry facts yet"}) — a later registry
          update never silently changes what this record meant. Unknown means unknown, not clear.
        </p>
      </Card>

      {mixOrder.length ? (
        <Card style={{ marginTop: 12, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Mixing order</h3>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
            {mixOrder.map((x) => (
              <li key={x.sequence} style={{ padding: "2px 0" }}>
                {x.materialDescription}
                {x.amountPerTankEntered != null ? ` — ${x.amountPerTankEntered} ${x.amountPerTankUnit ?? ""} per tank` : ""}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <Card style={{ marginTop: 12, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Blocks</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 13 }}>
                <th style={{ padding: "6px 10px" }}>Block</th>
                <th style={{ padding: "6px 10px" }}>Treated area</th>
                <th style={{ padding: "6px 10px" }}>Start → finish</th>
                <th style={{ padding: "6px 10px" }}>Carrier rate</th>
                <th style={{ padding: "6px 10px" }}>REI window</th>
                <th style={{ padding: "6px 10px" }}>Dried before rain</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={`${b.blockId}#${b.segmentNo}`} style={{ borderTop: "1px solid var(--border-subtle, rgba(20,19,15,0.08))" }}>
                  <td style={{ padding: "8px 10px" }}>{b.blockLabel}{b.segmentNo > 1 ? ` (segment ${b.segmentNo})` : ""}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {b.treatedAreaHa.toFixed(3)} ha
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}> ({b.treatedAreaSource.toLowerCase().replace(/_/g, " ")})</span>
                  </td>
                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{dtf(b.startedAt)} → {b.finishedAt ? dtf(b.finishedAt) : <span style={{ color: "var(--maroon, #6B484D)", fontStyle: "italic" }}>no finish time</span>}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {b.carrierRatePerHaL != null ? `${b.carrierRatePerHaL.toFixed(0)} L/ha` : <span style={{ fontStyle: "italic", color: "var(--maroon, #6B484D)" }}>unknown</span>}
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}> ({b.rateBasis.toLowerCase().replace(/_/g, " ")})</span>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    {b.reiWindow.state === "KNOWN" ? (
                      <>ends {dtf(b.reiWindow.reiEndsAt)} <span style={{ color: "var(--text-muted)", fontSize: 12 }}>({b.reiWindow.reiHours} h, {b.reiWindow.basis.toLowerCase()})</span></>
                    ) : (
                      <span style={{ color: "var(--maroon, #6B484D)", fontStyle: "italic" }}>unknown — cannot determine safely</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    {b.drying.source === "OVERRIDE" ? (
                      <>
                        {b.drying.value ? "yes" : "no"}{" "}
                        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                          (overridden by {b.drying.attribution.email})
                        </span>
                      </>
                    ) : b.drying.source === "DERIVED" ? (
                      <>
                        {b.drying.value ? "yes" : "no"} <span style={{ color: "var(--text-muted)", fontSize: 12 }}>(derived, {b.drying.basis.toLowerCase().replace(/_/g, " ")})</span>
                      </>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>not determined</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p style={{ marginTop: 16 }}>
        <Link href="/vineyards/sprays" style={{ color: "var(--accent, #722F37)" }}>← All spray records</Link>
      </p>
    </div>
  );
}
