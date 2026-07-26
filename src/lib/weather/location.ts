import "server-only";

// VI-P8 — resolve a vineyard's representative point. One climate estimate per vineyard (design P2); blocks
// share it. Used by ingest (fetch point) and the read loader (season latitude). Fallback chain so EVERY
// vineyard that has ANY location can get weather: planting-area centroid → block-polygon centroid → the
// grower's GPS PIN on VineyardDetail (gpsLat/gpsLng). Bhutan vineyards have pins but no drawn blocks, so the
// pin is what makes their weather work.

import { prisma } from "@/lib/prisma";

type Ring = number[][]; // [ [lon,lat], ... ]

function ringCentroid(ring: Ring): { lat: number; lon: number } | null {
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const pt of ring) {
    if (Array.isArray(pt) && typeof pt[0] === "number" && typeof pt[1] === "number") {
      sx += pt[0];
      sy += pt[1];
      n += 1;
    }
  }
  return n === 0 ? null : { lat: sy / n, lon: sx / n };
}

function geometryCentroid(geom: unknown): { lat: number; lon: number } | null {
  const g = geom as { type?: string; coordinates?: unknown };
  if (!g?.type || !g.coordinates) return null;
  if (g.type === "Polygon") return ringCentroid((g.coordinates as Ring[])[0]);
  if (g.type === "MultiPolygon") return ringCentroid((g.coordinates as Ring[][])[0]?.[0]);
  return null;
}

/** Average several points (for a vineyard's blocks). */
function meanPoint(points: Array<{ lat: number; lon: number }>): { lat: number; lon: number } | null {
  if (points.length === 0) return null;
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lon = points.reduce((s, p) => s + p.lon, 0) / points.length;
  return { lat, lon };
}

/** A vineyard's representative point, or null if it has no location anywhere. */
export async function resolveVineyardCentroid(vineyardId: string): Promise<{ lat: number; lon: number } | null> {
  // 1) Planting-area geometry (P1) — the precise analysis boundary.
  const area = await prisma.vineyardPlantingArea.findFirst({
    where: { vineyardId },
    select: { geometry: true },
    orderBy: { sortOrder: "asc" },
  });
  const areaCentroid = area ? geometryCentroid(area.geometry) : null;
  if (areaCentroid) return areaCentroid;

  // 2) Block polygons (drawn blocks, not yet migrated into a planting area) — average their centroids.
  const blocks = await prisma.vineyardBlock.findMany({ where: { vineyardId }, select: { polygon: true } });
  const blockCentroids = blocks.map((b) => geometryCentroid(b.polygon)).filter((c): c is { lat: number; lon: number } => c !== null);
  const blockMean = meanPoint(blockCentroids);
  if (blockMean) return blockMean;

  // 3) The grower's GPS PIN (VineyardDetail.gpsLat/gpsLng) — where they marked the vineyard on the map. This
  //    is what gives Bhutan (and any un-drawn vineyard) its weather.
  const detail = await prisma.vineyardDetail.findFirst({ where: { vineyardId }, select: { gpsLat: true, gpsLng: true } });
  if (detail?.gpsLat != null && detail?.gpsLng != null) {
    return { lat: Number(detail.gpsLat), lon: Number(detail.gpsLng) };
  }

  return null;
}
