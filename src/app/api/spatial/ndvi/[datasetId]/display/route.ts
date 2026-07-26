import { getCurrentUser } from "@/lib/dal";
import { accessDecision } from "@/lib/access";
import { runAsTenant } from "@/lib/tenant/context";
import { buildDisplayRender, buildDisplayMeta, type DisplayStyle } from "@/lib/spatial/ndvi-display-core";
import type { ColorScaleMode, ColorStop } from "@/lib/gis/color";

// VI-P3 — the NDVI overlay serving route. Auth-gated + tenant-scoped (RLS confines the dataset read to the
// user's tenant). Ensures the cached warped/quantized DISPLAY derivative, resolves the requested scale mode +
// palette, and returns either the overlay PNG (for L.imageOverlay) or the legend metadata (?meta=1).
// Cache: ETag keyed on the recipeVersion + all style params, `must-revalidate` (council #7 — never `immutable`,
// so a recipe bump or a fresh derivative is picked up). Node runtime (blob + zlib PNG encoding).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES = new Set<ColorScaleMode>([
  "VINEYARD_SCENE",
  "BLOCK_SCENE",
  "COMPARISON_LOCKED",
  "VINEYARD_BASELINE",
  "ABSOLUTE",
  "CUSTOM",
]);

function parseStyle(p: URLSearchParams): DisplayStyle {
  const modeRaw = p.get("mode") ?? "VINEYARD_SCENE";
  const mode = (MODES.has(modeRaw as ColorScaleMode) ? modeRaw : "VINEYARD_SCENE") as ColorScaleMode;
  const num = (k: string): number | undefined => {
    const v = p.get(k);
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  let customStops: ColorStop[] | null = null;
  const cs = p.get("customStops");
  if (cs) {
    try {
      const parsed = JSON.parse(cs);
      if (Array.isArray(parsed)) customStops = parsed as ColorStop[];
    } catch {
      customStops = null;
    }
  }
  const opacity = num("opacity");
  return {
    mode,
    paletteId: p.get("paletteId") ?? undefined,
    reverse: p.get("reverse") === "1" || p.get("reverse") === "true",
    opacity: opacity == null ? undefined : Math.min(1, Math.max(0, opacity)),
    percentileLow: num("plow"),
    percentileHigh: num("phigh"),
    fixedMin: num("fmin"),
    fixedMax: num("fmax"),
    customStops,
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await ctx.params;

  const user = await getCurrentUser();
  if (accessDecision(user, {}) !== "ok" || !user?.activeOrganizationId) {
    return Response.json({ error: "Not authorized." }, { status: 401 });
  }
  const tenantId = user.activeOrganizationId;
  const url = new URL(req.url);
  const style = parseStyle(url.searchParams);
  const wantMeta = url.searchParams.get("meta") === "1";

  try {
    if (wantMeta) {
      const meta = await runAsTenant(tenantId, () => buildDisplayMeta(datasetId, style));
      return Response.json(meta, { headers: { "Cache-Control": "private, must-revalidate" } });
    }

    const { png, meta, etag } = await runAsTenant(tenantId, () => buildDisplayRender(datasetId, style));
    if (req.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, must-revalidate" } });
    }
    return new Response(png as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        ETag: etag,
        "Cache-Control": "private, must-revalidate",
        "X-Ndvi-Bbox": JSON.stringify(meta.wgs84Bbox),
        "X-Ndvi-Domain": JSON.stringify([meta.domain.min, meta.domain.max]),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "render failed";
    // A dataset that isn't READY / has no raster is a 409 (retry after processing), not a 500.
    const notReady = message.includes("not READY") || message.includes("could not read");
    return Response.json({ error: message }, { status: notReady ? 409 : 500 });
  }
}
