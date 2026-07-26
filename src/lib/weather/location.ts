import "server-only";

// VI-P8 — resolve a vineyard's representative point (planting-area centroid). One climate estimate per
// vineyard (design P2); blocks share it. Used by ingest (fetch point) and the read loader (season latitude).

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

/** The vineyard's centroid from its first planting area, or null if it has no geometry yet. */
export async function resolveVineyardCentroid(vineyardId: string): Promise<{ lat: number; lon: number } | null> {
  const area = await prisma.vineyardPlantingArea.findFirst({
    where: { vineyardId },
    select: { geometry: true },
    orderBy: { sortOrder: "asc" },
  });
  if (!area) return null;
  return geometryCentroid(area.geometry);
}
