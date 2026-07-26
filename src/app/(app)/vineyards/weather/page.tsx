import { requireReadyUser, requireActiveTenant } from "@/lib/dal";
import { isTenantAdminLike } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { Eyebrow } from "@/components/ui";
import { loadVineyardClimateSummary } from "@/lib/weather/actions";
import { WeatherCard } from "./WeatherCard";

// VI-P8 Unit 10 — the grower climate card on the existing vineyard surface (vineyard-root only, R16). Simple
// headline in the primary source's numbers; progressive disclosure for the spread. Renders offline from the
// stored daily rows; a "Refresh weather" button pulls the current season live.
export default async function WeatherPage({ searchParams }: { searchParams: Promise<{ vineyard?: string }> }) {
  const user = await requireReadyUser();
  await requireActiveTenant();
  const sp = await searchParams;

  const vineyards = isTenantAdminLike(user)
    ? await prisma.vineyard.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : user.vineyardIds.length
      ? await prisma.vineyard.findMany({ where: { id: { in: user.vineyardIds } }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : [];

  const selected = vineyards.find((v) => v.id === sp.vineyard) ?? vineyards[0] ?? null;
  const summary = selected ? await loadVineyardClimateSummary(selected.id) : null;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Eyebrow rule>Vineyard Intelligence</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: "10px 0 4px" }}>Weather &amp; climate</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: 0, marginBottom: 16 }}>
        One climate estimate per vineyard, terrain-aware, beside your nearest station. Blocks share it — grids resolve site-vs-region, not block-vs-block.
      </p>
      {vineyards.length === 0 ? (
        <p>No vineyards you can access.</p>
      ) : (
        <WeatherCard vineyards={vineyards} selectedId={selected?.id ?? null} summary={summary} />
      )}
    </div>
  );
}
