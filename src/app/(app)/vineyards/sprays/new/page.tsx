import Link from "next/link";
import { requireReadyUser, requireActiveTenant } from "@/lib/dal";
import { Eyebrow } from "@/components/ui";
import { loadSprayFormBlocks } from "@/lib/spray/actions";
import { SprayForm } from "../SprayForm";

// S3a Unit 14 — record a spray pass. Enter once; every selected block becomes its own block line.
export default async function NewSprayPage() {
  await requireReadyUser();
  await requireActiveTenant();
  const blocks = await loadSprayFormBlocks();

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <Eyebrow rule>Spray Intelligence</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, margin: "10px 0 4px" }}>Record a spray</h1>
      <p style={{ color: "var(--text-muted)", marginTop: 0, marginBottom: 16 }}>
        What you enter here is the permanent record — a mistake later is fixed by a correction revision, never an edit.
        Unknowns are fine: a blank EPA number or a missing finish time records honestly as <em>unknown</em>.
      </p>
      {!blocks.ok ? (
        <p style={{ color: "var(--danger, #B63D35)" }}>{blocks.error}</p>
      ) : (
        <SprayForm blocks={blocks.data} mode="create" />
      )}
      <p style={{ marginTop: 16 }}>
        <Link href="/vineyards/sprays" style={{ color: "var(--accent, #722F37)" }}>← All spray records</Link>
      </p>
    </div>
  );
}
