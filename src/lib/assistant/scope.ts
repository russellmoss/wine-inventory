import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/access";
import { parseVesselRef } from "@/lib/vessels/ref";

/**
 * Shared scoping for assistant read tools. Scoping is the handler's job, NEVER
 * trusted to the model. Managers (role !== "admin") are pinned to their vineyard
 * membership SET (D9); admins see all. Returns null when a manager has no vineyards
 * (nothing is in scope).
 */
export function scopedVineyardWhere(user: AppUser): Prisma.VineyardWhereInput | null {
  if (user.role === "admin") return {};
  if (user.vineyardIds.length === 0) return null;
  return { id: { in: user.vineyardIds } };
}

/**
 * Resolve vineyards the user may access, optionally narrowed by a partial name.
 * Empty array means "nothing in scope / no match" — the tool decides how to
 * report that. Capped so an admin query can't fan out unbounded.
 */
export async function resolveVineyards(
  user: AppUser,
  name?: string,
): Promise<{ id: string; name: string }[]> {
  const base = scopedVineyardWhere(user);
  if (base === null) return [];
  const where: Prisma.VineyardWhereInput = name
    ? { AND: [base, { name: { contains: name, mode: "insensitive" } }] }
    : base;
  return prisma.vineyard.findMany({
    where,
    orderBy: { name: "asc" },
    take: 25,
    select: { id: true, name: true },
  });
}

export type ScopedBlock = {
  id: string;
  label: string;
  vineyardId: string;
  vineyardName: string;
  varietyName: string | null;
};

/** Normalize a label/variety for fuzzy compare: drop parentheticals + punctuation. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
}

/**
 * Find blocks the user may access, narrowed by vineyard name, grape variety, and/or
 * a fuzzy block label. Scoped to the manager's vineyard (admins see all). The label
 * match is two-directional and variety-aware so "Block 2", "Block 2 (Grenache)",
 * "block2", or even "grenache" all resolve sensibly. Used by write tools to resolve
 * a single target block before proposing a change.
 */
export async function findScopedBlocks(
  user: AppUser,
  opts: { block?: string; vineyard?: string; variety?: string },
): Promise<ScopedBlock[]> {
  const where: Prisma.VineyardBlockWhereInput = {};
  if (user.role !== "admin") {
    if (user.vineyardIds.length === 0) return [];
    where.vineyardId = { in: user.vineyardIds };
  }
  if (opts.vineyard) where.vineyard = { name: { contains: opts.vineyard, mode: "insensitive" } };
  if (opts.variety) where.variety = { name: { contains: opts.variety, mode: "insensitive" } };

  const rows = await prisma.vineyardBlock.findMany({
    where,
    take: 50,
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      blockLabel: true,
      vineyardId: true,
      vineyard: { select: { name: true } },
      variety: { select: { name: true } },
    },
  });

  let blocks: ScopedBlock[] = rows.map((b) => ({
    id: b.id,
    label: b.blockLabel ?? "(unlabeled)",
    vineyardId: b.vineyardId,
    vineyardName: b.vineyard.name,
    varietyName: b.variety?.name ?? null,
  }));

  // Fuzzy block filter in JS: match label OR variety, either direction.
  if (opts.block) {
    const needle = norm(opts.block);
    if (needle) {
      blocks = blocks.filter((b) => {
        const label = norm(b.label);
        const variety = b.varietyName ? norm(b.varietyName) : "";
        const hit = (hay: string) => hay !== "" && (hay === needle || hay.includes(needle) || needle.includes(hay));
        return hit(label) || hit(variety);
      });
    }
  }
  return blocks;
}

export type ResolvedVessel = Prisma.VesselGetPayload<{
  include: { components: { include: { variety: true; vineyard: true } } };
}>;

/**
 * Resolve a free-text vessel reference ("barrel 14", "tank 1") to the vessel,
 * with its components loaded for preview. Vessels are cellar equipment and are
 * NOT vineyard-scoped, so this is available to any ready user. Throws a clear,
 * model-relayable message when the reference is unparseable or unknown.
 */
export async function resolveVessel(text: string): Promise<ResolvedVessel> {
  const ref = parseVesselRef(text);
  if (!ref) {
    throw new Error(`I couldn't tell which vessel "${text}" is. Try e.g. "barrel 14" or "tank 1".`);
  }
  const vessel = await prisma.vessel.findFirst({
    where: { type: ref.type, code: ref.code },
    include: { components: { include: { variety: true, vineyard: true } } },
  });
  if (!vessel) {
    throw new Error(`No ${ref.type === "BARREL" ? "barrel" : "tank"} "${ref.code}" exists.`);
  }
  return vessel;
}

/**
 * What a vessel currently holds, for the assistant's "tank N and its history"
 * flow. Resolves against the authoritative `vesselLots` projection (the same
 * source the /vessels page links from), NOT the raw ledger. Returns the shape
 * so the tool can answer honestly: single lot -> offer to open it; blend ->
 * list each lot's link; empty -> point at the tanks list. Never picks one lot
 * out of a blend. Tenant-scoped automatically via the prisma extension (RLS);
 * vessels are cellar equipment and are not vineyard-bound.
 */
export type VesselContents =
  | { kind: "empty"; vesselLabel: string }
  | { kind: "single"; vesselLabel: string; lot: { id: string; code: string } }
  | { kind: "blend"; vesselLabel: string; lots: { id: string; code: string }[] };

export async function resolveVesselContents(text: string): Promise<VesselContents> {
  const ref = parseVesselRef(text);
  if (!ref) {
    throw new Error(`I couldn't tell which vessel "${text}" is. Try e.g. "barrel 14" or "tank 1".`);
  }
  const vessel = await prisma.vessel.findFirst({
    where: { type: ref.type, code: ref.code },
    select: {
      code: true,
      type: true,
      vesselLots: { include: { lot: { select: { id: true, code: true } } } },
    },
  });
  if (!vessel) {
    throw new Error(`No ${ref.type === "BARREL" ? "barrel" : "tank"} "${ref.code}" exists.`);
  }
  const label = `${ref.type === "BARREL" ? "Barrel" : "Tank"} ${vessel.code}`;
  const lots = vessel.vesselLots.map((vl) => ({ id: vl.lot.id, code: vl.lot.code }));
  if (lots.length === 0) return { kind: "empty", vesselLabel: label };
  if (lots.length === 1) return { kind: "single", vesselLabel: label, lot: lots[0] };
  return { kind: "blend", vesselLabel: label, lots };
}
