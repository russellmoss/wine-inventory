import Link from "next/link";
import { requireReadyUser, requireActiveTenant } from "@/lib/dal";
import { Eyebrow } from "@/components/ui";
import { loadPlannedHarvestBoard } from "@/lib/harvest/planned-harvest-actions";
import { PlannedHarvestBoard } from "./PlannedHarvestBoard";

// S3a Unit 14 — the planned-harvest board. Every change is an audited event: setting a date closes
// the open version and appends the next; retraction closes without a successor. S7a's PHI engine
// will read this stream — pulling a date forward is exactly the change that must never be silent.
export default async function PlannedHarvestPage({ searchParams }: { searchParams: Promise<{ vintage?: string }> }) {
  await requireReadyUser();
  await requireActiveTenant();
  const sp = await searchParams;
  const vintageYear = Number(sp.vintage) || new Date().getUTCFullYear();
  const result = await loadPlannedHarvestBoard(vintageYear);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Eyebrow rule>Spray Intelligence</Eyebrow>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, margin: "10px 0 4px" }}>Planned harvest — {vintageYear}</h1>
        <form method="get">
          <label htmlFor="ph-vintage" style={{ fontSize: 13, color: "var(--text-secondary)", marginRight: 6 }}>Vintage</label>
          <input id="ph-vintage" name="vintage" type="number" defaultValue={vintageYear} style={{ width: 90, padding: "6px 8px", borderRadius: 10, border: "1px solid var(--border-default, #DED7C6)" }} />
        </form>
      </div>
      <p style={{ color: "var(--text-muted)", marginTop: 0, marginBottom: 16 }}>
        Per block, per pass — split picks get their own label. Every change is versioned and audited;
        PHI decisions read this date, so moving it is never silent.
      </p>
      {!result.ok ? <p style={{ color: "var(--danger, #B63D35)" }}>{result.error}</p> : <PlannedHarvestBoard rows={result.data} vintageYear={vintageYear} />}
      <p style={{ marginTop: 16 }}>
        <Link href="/vineyards/sprays" style={{ color: "var(--accent, #722F37)" }}>← Spray records</Link>
      </p>
    </div>
  );
}
