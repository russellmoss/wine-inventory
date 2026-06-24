// Loader + PURE serializers for the vineyard modal. The serializers convert
// every Prisma Decimal to a plain number and pass GeoJSON Json through as-is,
// so no Decimal ever crosses the server -> client boundary. They take no DB
// dependency and are unit-tested directly.

/** Anything Decimal-ish a Prisma row hands us. */
type DecimalLike = number | string | { toNumber: () => number } | null | undefined;

function decToNum(v: DecimalLike): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    const n = v.toNumber();
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type BlockVariety = { id: string; name: string; color: string | null };

export type RawBlock = {
  id: string;
  vineyardId: string;
  blockLabel: string | null;
  numRows: number | null;
  rowSpacingM: DecimalLike;
  vineSpacingM: DecimalLike;
  varietyId: string | null;
  clone: string | null;
  rootstock: string | null;
  vineCount: number | null;
  yearPlanted: number | null;
  irrigated: boolean | null;
  polygon: unknown;
  color: string | null;
  sortOrder: number;
  variety?: BlockVariety | null;
};

export type SerializedBlock = {
  id: string;
  vineyardId: string;
  blockLabel: string | null;
  numRows: number | null;
  rowSpacingM: number | null;
  vineSpacingM: number | null;
  varietyId: string | null;
  clone: string | null;
  rootstock: string | null;
  vineCount: number | null;
  yearPlanted: number | null;
  irrigated: boolean | null;
  polygon: unknown;
  color: string | null;
  sortOrder: number;
  variety: BlockVariety | null;
};

export type RawDetail = {
  id: string;
  vineyardId: string;
  gpsLat: DecimalLike;
  gpsLng: DecimalLike;
  elevationM: DecimalLike;
  soilType: string | null;
  manager: string | null;
  defaultUnit: string;
};

export type SerializedDetail = {
  id: string;
  vineyardId: string;
  gpsLat: number | null;
  gpsLng: number | null;
  elevationM: number | null;
  soilType: string | null;
  manager: string | null;
  defaultUnit: string;
};

export type VineyardDetailPayload = {
  detail: SerializedDetail | null;
  blocks: SerializedBlock[];
};

// NOTE: the per-vineyard loader lives in ./actions.ts (a "use server" module) so
// it can be called from client components without dragging server-only deps
// (prisma, auth) into the client bundle. The pure serializers above are used by
// that loader and are also unit-tested directly.

/** Pure: convert a block row's Decimals to numbers; leave GeoJSON geometry intact. */
export function serializeBlock(row: RawBlock): SerializedBlock {
  return {
    id: row.id,
    vineyardId: row.vineyardId,
    blockLabel: row.blockLabel,
    numRows: row.numRows,
    rowSpacingM: decToNum(row.rowSpacingM),
    vineSpacingM: decToNum(row.vineSpacingM),
    varietyId: row.varietyId,
    clone: row.clone,
    rootstock: row.rootstock,
    vineCount: row.vineCount,
    yearPlanted: row.yearPlanted,
    irrigated: row.irrigated,
    polygon: row.polygon ?? null,
    color: row.color,
    sortOrder: row.sortOrder,
    variety: row.variety ?? null,
  };
}

/** Pure: convert a detail row's Decimals (lat/lng/elevation) to numbers. */
export function serializeDetail(row: RawDetail): SerializedDetail {
  return {
    id: row.id,
    vineyardId: row.vineyardId,
    gpsLat: decToNum(row.gpsLat),
    gpsLng: decToNum(row.gpsLng),
    elevationM: decToNum(row.elevationM),
    soilType: row.soilType,
    manager: row.manager,
    defaultUnit: row.defaultUnit,
  };
}

