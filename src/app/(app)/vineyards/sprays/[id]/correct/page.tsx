import Link from "next/link";
import { requireReadyUser, requireActiveTenant } from "@/lib/dal";
import { Eyebrow } from "@/components/ui";
import { loadSprayFormBlocks, loadSprayFormInitial } from "@/lib/spray/actions";
import { SprayForm } from "../../SprayForm";

// S3a Unit 14 — correction reopens the form pre-filled; submitting writes a FULL new revision
// through correctSprayApplicationCore. There is NO edit path to the original, by construction.
export default async function CorrectSprayPage({ params }: { params: Promise<{ id: string }> }) {
  await requireReadyUser();
  await requireActiveTenant();
  const { id } = await params;
  const [blocks, prefill] = await Promise.all([loadSprayFormBlocks(), loadSprayFormInitial(id)]);

  if (!prefill.ok || !blocks.ok) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "var(--danger, #B63D35)" }}>{!prefill.ok ? prefill.error : !blocks.ok ? blocks.error : ""}</p>
        <Link href="/vineyards/sprays">Back to spray records</Link>
      </div>
    );
  }
  if (!prefill.data.correctability.correctable) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Eyebrow rule>Spray Intelligence</Eyebrow>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, margin: "10px 0 4px" }}>Not correctable</h1>
        <p>{prefill.data.correctability.reason}</p>
        <Link href={`/vineyards/sprays/${id}`} style={{ color: "var(--accent, #722F37)" }}>← Back to the record</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <Eyebrow rule>Spray Intelligence</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, margin: "10px 0 4px" }}>Correct this spray record</h1>
      <p style={{ color: "var(--text-muted)", marginTop: 0, marginBottom: 16 }}>
        Submitting appends a NEW revision and marks this one superseded — the original stays readable forever.
        Registry facts are carried over verbatim unless you change a product&apos;s identity.
      </p>
      <SprayForm blocks={blocks.data} mode="correct" predecessorId={prefill.data.predecessorId} initial={prefill.data.initial} />
      <p style={{ marginTop: 16 }}>
        <Link href={`/vineyards/sprays/${id}`} style={{ color: "var(--accent, #722F37)" }}>← Back without correcting</Link>
      </p>
    </div>
  );
}
