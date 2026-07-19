import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveExactlyOne } from "./resolve";

// Plan 080 U12 — shared free-text → ONE active Location resolution for every stock tool. Extracted from
// adjust_inventory (which now uses it too) so the consumable receive/adjust/transfer tools and the wine
// tools resolve a location the SAME way instead of four near-copies drifting apart.
//
// Behaviour, deliberately: a named location must match EXACTLY ONE active row (ambiguity is an error the
// user resolves by being specific — never a silent pick); an OMITTED location resolves only when the winery
// has exactly one, otherwise it asks which. Nothing here writes.

export type PickedLocation = { id: string; name: string };

export async function pickLocation(location: string | undefined, label = "location"): Promise<PickedLocation> {
  const locs = await prisma.location.findMany({
    where: { isActive: true, ...(location ? { name: { contains: location, mode: "insensitive" } } : {}) },
    take: 10,
    select: { id: true, name: true },
  });
  if (locs.length === 0) throw new Error(location ? `No location matches "${location}".` : "No active locations exist.");
  if (location) {
    return resolveExactlyOne(locs, {
      describe: (l) => l.name,
      noneMsg: `No location matches "${location}".`,
      manyMsg: `Several locations match "${location}"`,
    });
  }
  if (locs.length === 1) return locs[0];
  throw new Error(`Which ${label}? One of: ${locs.map((l) => l.name).join(", ")}.`);
}
