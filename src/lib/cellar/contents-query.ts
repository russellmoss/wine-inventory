import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPressableLotState } from "@/lib/ferment/press-data";
import { parseVesselRef } from "@/lib/vessels/ref";

export type CellarContentsQuery = {
  vessel?: string;
  variety?: string;
  vineyard?: string;
  lot?: string;
  vintage?: number;
  form?: "FRUIT" | "MUST" | "JUICE" | "WINE" | "BOTTLED_IN_PROCESS" | "FINISHED" | "BULK" | "BOTTLED" | string;
  vesselType?: "TANK" | "BARREL";
  onlyNonEmpty?: boolean;
  onlyPressable?: boolean;
  limit?: number;
};

export type CellarContentsResult = {
  vessels: {
    vesselId: string;
    label: string;
    code: string;
    type: "TANK" | "BARREL";
    capacityL: number;
    totalVolumeL: number;
    lots: {
      lotId: string;
      code: string;
      path: string;
      form: string;
      status: string;
      volumeL: number;
      varietyName: string | null;
      vineyardName: string | null;
      vintage: number | null;
    }[];
  }[];
  emptyMatches: number;
  truncated: boolean;
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

function num(value: unknown): number {
  return value == null ? 0 : typeof value === "number" ? value : Number(value);
}

function label(type: string, code: string): string {
  return `${type === "BARREL" ? "Barrel" : "Tank"} ${code}`;
}

function normVesselCode(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function vesselCodeCandidates(text: string): { type: "TANK" | "BARREL" | null; wanted: string[]; codes: string[] } {
  const ref = parseVesselRef(text);
  const original = (text ?? "").trim();
  const raw = (ref?.code ?? text ?? "").trim();
  const wanted = new Set<string>([normVesselCode(raw)]);
  const codes = new Set<string>([original, raw]);
  if (ref) {
    const typed = `${ref.type === "BARREL" ? "B" : "T"}${raw}`;
    wanted.add(normVesselCode(typed));
    codes.add(typed);
  }
  return { type: ref?.type ?? null, wanted: [...wanted].filter(Boolean), codes: [...codes].filter(Boolean) };
}

function vesselWhere(ref: string | undefined, vesselType: CellarContentsQuery["vesselType"]): Prisma.VesselWhereInput {
  const where: Prisma.VesselWhereInput = { isActive: true };
  if (vesselType) where.type = vesselType;
  if (!ref) return where;
  const { type, codes } = vesselCodeCandidates(ref);
  const typeFilter = type ?? vesselType;
  if (typeFilter) where.type = typeFilter;
  if (codes.length > 0) {
    where.OR = codes.map((w) => ({
      code: { equals: w, mode: "insensitive" },
    }));
  }
  return where;
}

function normalizeForm(form: CellarContentsQuery["form"]): "FRUIT" | "MUST" | "JUICE" | "WINE" | "BOTTLED_IN_PROCESS" | "FINISHED" | null {
  if (!form) return null;
  const up = form.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (up === "BULK") return "WINE";
  if (up === "BOTTLED") return "FINISHED";
  if (up === "FRUIT" || up === "MUST" || up === "JUICE" || up === "WINE" || up === "BOTTLED_IN_PROCESS" || up === "FINISHED") return up;
  return null;
}

async function idsForNameSearch(model: "variety" | "vineyard", name: string): Promise<string[]> {
  if (model === "variety") {
    const rows = await prisma.variety.findMany({
      where: { name: { contains: name, mode: "insensitive" } },
      take: MAX_LIMIT,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  const rows = await prisma.vineyard.findMany({
    where: { name: { contains: name, mode: "insensitive" } },
    take: MAX_LIMIT,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function buildLotWhere(query: CellarContentsQuery): Promise<Prisma.LotWhereInput | null> {
  const AND: Prisma.LotWhereInput[] = [{ status: "ACTIVE" }];
  const variety = clean(query.variety);
  const vineyard = clean(query.vineyard);
  const lot = clean(query.lot);
  const form = normalizeForm(query.form);

  if (lot) {
    AND.push({
      OR: [
        { code: { contains: lot, mode: "insensitive" } },
        { displayName: { contains: lot, mode: "insensitive" } },
      ],
    });
  }
  if (query.vintage != null) AND.push({ vintageYear: query.vintage });
  if (query.form && !form) return null;
  if (form) AND.push({ form });
  if (query.onlyPressable) AND.push({ form: "MUST", status: "ACTIVE" });
  if (variety) {
    const ids = await idsForNameSearch("variety", variety);
    if (ids.length === 0) return null;
    AND.push({ originVarietyId: { in: ids } });
  }
  if (vineyard) {
    const ids = await idsForNameSearch("vineyard", vineyard);
    if (ids.length === 0) return null;
    AND.push({
      OR: [
        { originVineyardId: { in: ids } },
        { sourceVineyards: { some: { vineyardId: { in: ids } } } },
      ],
    });
  }
  return AND.length === 1 ? AND[0] : { AND };
}

export async function queryCellarContents(raw: CellarContentsQuery): Promise<CellarContentsResult> {
  const query = raw ?? {};
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(query.limit ?? DEFAULT_LIMIT)));
  const exactVessel = !!clean(query.vessel);
  const onlyNonEmpty = query.onlyNonEmpty ?? !exactVessel;
  const lotWhere = await buildLotWhere(query);
  if (lotWhere == null) return { vessels: [], emptyMatches: 0, truncated: false };

  const where: Prisma.VesselWhereInput = vesselWhere(clean(query.vessel), query.vesselType);
  if (onlyNonEmpty) where.vesselLots = { some: { lot: lotWhere } };

  const rows = await prisma.vessel.findMany({
    where,
    orderBy: [{ type: "asc" }, { code: "asc" }],
    take: limit + 1,
    select: {
      id: true,
      code: true,
      type: true,
      capacityL: true,
      vesselLots: {
        where: { lot: lotWhere },
        orderBy: [{ vessel: { code: "asc" } }, { lot: { code: "asc" } }],
        select: {
          lotId: true,
          volumeL: true,
          lot: {
            select: {
              id: true,
              code: true,
              form: true,
              status: true,
              originVarietyId: true,
              originVineyardId: true,
              vintageYear: true,
              sourceVineyards: { select: { vineyardId: true } },
            },
          },
        },
      },
    },
  });

  const truncated = rows.length > limit;
  const page = rows.slice(0, limit);
  const varietyIds = new Set<string>();
  const vineyardIds = new Set<string>();
  for (const vessel of page) {
    for (const vl of vessel.vesselLots) {
      if (vl.lot.originVarietyId) varietyIds.add(vl.lot.originVarietyId);
      if (vl.lot.originVineyardId) vineyardIds.add(vl.lot.originVineyardId);
      for (const sv of vl.lot.sourceVineyards) vineyardIds.add(sv.vineyardId);
    }
  }

  const [varieties, vineyards] = await Promise.all([
    varietyIds.size
      ? prisma.variety.findMany({ where: { id: { in: [...varietyIds] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    vineyardIds.size
      ? prisma.vineyard.findMany({ where: { id: { in: [...vineyardIds] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const varietyById = new Map(varieties.map((v) => [v.id, v.name]));
  const vineyardById = new Map(vineyards.map((v) => [v.id, v.name]));

  let emptyMatches = 0;
  const vessels = page.flatMap((v) => {
    const lots = v.vesselLots
      .filter((vl) => !query.onlyPressable || isPressableLotState(vl.lot))
      .map((vl) => {
        const sourceVineyardId = vl.lot.originVineyardId ?? vl.lot.sourceVineyards[0]?.vineyardId ?? null;
        return {
          lotId: vl.lot.id,
          code: vl.lot.code,
          path: `/lots/${vl.lot.id}`,
          form: vl.lot.form,
          status: vl.lot.status,
          volumeL: num(vl.volumeL),
          varietyName: vl.lot.originVarietyId ? varietyById.get(vl.lot.originVarietyId) ?? null : null,
          vineyardName: sourceVineyardId ? vineyardById.get(sourceVineyardId) ?? null : null,
          vintage: vl.lot.vintageYear ?? null,
        };
      });
    if (lots.length === 0) {
      emptyMatches += 1;
      if (!exactVessel && onlyNonEmpty) return [];
    }
    return [{
      vesselId: v.id,
      label: label(v.type, v.code),
      code: v.code,
      type: v.type as "TANK" | "BARREL",
      capacityL: num(v.capacityL),
      totalVolumeL: Math.round(lots.reduce((sum, lot) => sum + lot.volumeL, 0) * 100) / 100,
      lots,
    }];
  });

  if (exactVessel && vessels.length > 1) {
    const { wanted } = vesselCodeCandidates(query.vessel ?? "");
    const want = new Set(wanted);
    const exact = vessels.filter((v) => want.has(normVesselCode(v.code)));
    return { vessels: exact.length ? exact : vessels, emptyMatches, truncated };
  }

  return { vessels, emptyMatches, truncated };
}
