import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/access";
import { findScopedBlocks, resolveVineyards } from "./scope";
import type { FieldSpec, ValidatedValues } from "./fields";
import { resolveExactlyOne } from "./tools/resolve";

/**
 * Entity registry for the generic CRUD layer — the single source of truth for
 * which tables the assistant may create/edit/delete, how to find a row, how it's
 * scoped, and its delete semantics. Tables NOT in ENTITIES (AuditLog, User/auth)
 * are unreachable by every db_* tool by construction.
 */

export type RelationKind = "cascade" | "restrict" | "setNull";

/** A child relation pointing AT this entity, with how a parent delete affects it. */
export type RelationSpec = {
  label: string; // human plural, e.g. "Brix readings"
  kind: RelationKind;
  count: (id: string) => Promise<number>;
};

export type EntityRow = { id: string; label: string; vineyardId: string | null };

export type EntityConfig = {
  name: string; // canonical key, e.g. "VineyardBlock"
  displayName: string; // human singular, e.g. "block"
  vineyardScoped: boolean;
  /** Find candidate rows from a natural-language query, scoped to the user. */
  find: (user: AppUser, query: string) => Promise<EntityRow[]>;
  /** Load one row by id (for confirm-time re-resolution + scope), or null. */
  load: (id: string) => Promise<EntityRow | null>;
  /** Child relations, for delete introspection (cascade/restrict/setNull). */
  relations: RelationSpec[];
  /** Delete the row within a transaction (audit handled by the committer). */
  del: (tx: Prisma.TransactionClient, id: string) => Promise<void>;

  // ── Optional create/update support (db_create / db_update) ──
  /** Fields accepted on create (validated by fields.ts; FK names resolved in buildCreate). */
  creatable?: FieldSpec[];
  /** Resolve FK names + assemble the prisma `data` for a create. Async, pre-transaction. */
  buildCreate?: (user: AppUser, values: ValidatedValues) => Promise<{ data: Record<string, unknown>; label: string }>;
  /** Insert the row within a transaction; returns the new id. */
  create?: (tx: Prisma.TransactionClient, data: Record<string, unknown>) => Promise<string>;
  /** Scalar fields the user may edit. */
  editable?: FieldSpec[];
  /** Current editable values, for diff/preview, or null if the row is gone. */
  current?: (id: string) => Promise<Record<string, unknown> | null>;
  /** Apply validated edits within a transaction. */
  update?: (tx: Prisma.TransactionClient, id: string, values: ValidatedValues) => Promise<void>;
};

// ───────────────────────── VineyardBlock (Unit 1 vertical slice) ─────────────────────────

const vineyardBlock: EntityConfig = {
  name: "VineyardBlock",
  displayName: "block",
  vineyardScoped: true,
  async find(user, query) {
    const blocks = await findScopedBlocks(user, { block: query });
    return blocks.map((b) => ({
      id: b.id,
      label: `${b.label}${b.varietyName ? ` (${b.varietyName})` : ""} in ${b.vineyardName}`,
      vineyardId: b.vineyardId,
    }));
  },
  async load(id) {
    const row = await prisma.vineyardBlock.findUnique({
      where: { id },
      select: { id: true, blockLabel: true, vineyardId: true, vineyard: { select: { name: true } } },
    });
    if (!row) return null;
    return { id: row.id, label: `${row.blockLabel ?? "(unlabeled)"} in ${row.vineyard.name}`, vineyardId: row.vineyardId };
  },
  relations: [
    // BrixLog.block and HarvestRecord.block are onDelete: Restrict — a block with
    // either cannot be deleted until those are removed.
    { label: "Brix readings", kind: "restrict", count: (id) => prisma.brixLog.count({ where: { blockId: id } }) },
    { label: "harvest records", kind: "restrict", count: (id) => prisma.harvestRecord.count({ where: { blockId: id } }) },
  ],
  async del(tx, id) {
    await tx.vineyardBlock.delete({ where: { id } });
  },
  editable: [
    { name: "blockLabel", type: "string", min: 1, max: 80, description: "Block label, e.g. 'Block 2'." },
    { name: "numRows", type: "int", min: 0, description: "Number of rows." },
    { name: "vineCount", type: "int", min: 0, description: "Number of vines." },
    { name: "yearPlanted", type: "int", min: 1900, max: 2100, description: "Year planted." },
    { name: "clone", type: "string", max: 80, description: "Clone." },
    { name: "rootstock", type: "string", max: 80, description: "Rootstock." },
    { name: "irrigated", type: "boolean", description: "Whether the block is irrigated." },
  ],
  async current(id) {
    return prisma.vineyardBlock.findUnique({
      where: { id },
      select: { blockLabel: true, numRows: true, vineCount: true, yearPlanted: true, clone: true, rootstock: true, irrigated: true },
    });
  },
  async update(tx, id, values) {
    await tx.vineyardBlock.update({ where: { id }, data: values as Prisma.VineyardBlockUncheckedUpdateInput });
  },
  creatable: [
    { name: "vineyard", type: "string", required: true, description: "Vineyard name the block belongs to." },
    { name: "blockLabel", type: "string", min: 1, max: 80, description: "Block label, e.g. 'Block 6'." },
    { name: "variety", type: "string", description: "Grape variety name (optional)." },
    { name: "vineCount", type: "int", min: 0, description: "Number of vines (optional)." },
    { name: "yearPlanted", type: "int", min: 1900, max: 2100, description: "Year planted (optional)." },
  ],
  async buildCreate(user, values) {
    const vineyards = await resolveVineyards(user, String(values.vineyard));
    const vineyard = resolveExactlyOne(vineyards, {
      describe: (v) => v.name,
      noneMsg: `No vineyard matches "${values.vineyard}" that you can access.`,
      manyMsg: `Several vineyards match "${values.vineyard}"`,
    });
    let varietyId: string | undefined;
    if (values.variety) {
      const varieties = await prisma.variety.findMany({
        where: { name: { contains: String(values.variety), mode: "insensitive" } },
        take: 6,
        select: { id: true, name: true },
      });
      varietyId = resolveExactlyOne(varieties, {
        describe: (v) => v.name,
        noneMsg: `No variety matches "${values.variety}".`,
        manyMsg: `Several varieties match "${values.variety}"`,
      }).id;
    }
    const data: Record<string, unknown> = {
      vineyardId: vineyard.id,
      blockLabel: values.blockLabel ?? null,
      varietyId: varietyId ?? null,
      vineCount: values.vineCount ?? null,
      yearPlanted: values.yearPlanted ?? null,
    };
    return { data, label: `${values.blockLabel ?? "(unlabeled)"} in ${vineyard.name}` };
  },
  async create(tx, data) {
    const row = await tx.vineyardBlock.create({
      data: data as Prisma.VineyardBlockUncheckedCreateInput,
      select: { id: true },
    });
    return row.id;
  },
};

// ───────────────────────── Vineyard ─────────────────────────

const vineyard: EntityConfig = {
  name: "Vineyard",
  displayName: "vineyard",
  vineyardScoped: true,
  find: async (user, q) => (await resolveVineyards(user, q)).map((v) => ({ id: v.id, label: v.name, vineyardId: v.id })),
  load: async (id) => {
    const v = await prisma.vineyard.findUnique({ where: { id }, select: { id: true, name: true } });
    return v ? { id: v.id, label: v.name, vineyardId: v.id } : null;
  },
  relations: [
    { label: "blocks", kind: "cascade", count: (id) => prisma.vineyardBlock.count({ where: { vineyardId: id } }) },
    { label: "field notes", kind: "cascade", count: (id) => prisma.fieldNote.count({ where: { vineyardId: id } }) },
    { label: "detail record", kind: "cascade", count: (id) => prisma.vineyardDetail.count({ where: { vineyardId: id } }) },
    { label: "Brix readings", kind: "restrict", count: (id) => prisma.brixLog.count({ where: { vineyardId: id } }) },
    { label: "harvest records", kind: "restrict", count: (id) => prisma.harvestRecord.count({ where: { vineyardId: id } }) },
    { label: "vessel components", kind: "restrict", count: (id) => prisma.vesselComponent.count({ where: { vineyardId: id } }) },
    { label: "bottling sources", kind: "restrict", count: (id) => prisma.bottlingSource.count({ where: { vineyardId: id } }) },
    { label: "assigned managers", kind: "setNull", count: (id) => prisma.user.count({ where: { assignedVineyardId: id } }) },
  ],
  del: async (tx, id) => { await tx.vineyard.delete({ where: { id } }); },
  editable: [
    { name: "name", type: "string", min: 2, max: 80 },
    { name: "isActive", type: "boolean" },
  ],
  current: (id) => prisma.vineyard.findUnique({ where: { id }, select: { name: true, isActive: true } }),
  update: async (tx, id, v) => { await tx.vineyard.update({ where: { id }, data: v as Prisma.VineyardUncheckedUpdateInput }); },
  creatable: [{ name: "name", type: "string", required: true, min: 2, max: 80 }],
  buildCreate: async (_user, v) => ({ data: { name: String(v.name) }, label: String(v.name) }),
  create: async (tx, data) => (await tx.vineyard.create({ data: data as Prisma.VineyardUncheckedCreateInput, select: { id: true } })).id,
};

// ───────────────────────── Global registries (admin-only to mutate) ─────────────────────────

const variety: EntityConfig = {
  name: "Variety",
  displayName: "variety",
  vineyardScoped: false,
  find: async (_u, q) =>
    (await prisma.variety.findMany({ where: q ? { name: { contains: q, mode: "insensitive" } } : {}, take: 25, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((v) => ({ id: v.id, label: v.name, vineyardId: null })),
  load: async (id) => {
    const v = await prisma.variety.findUnique({ where: { id }, select: { id: true, name: true } });
    return v ? { id: v.id, label: v.name, vineyardId: null } : null;
  },
  relations: [
    { label: "vessel components", kind: "restrict", count: (id) => prisma.vesselComponent.count({ where: { varietyId: id } }) },
    { label: "bottling sources", kind: "restrict", count: (id) => prisma.bottlingSource.count({ where: { varietyId: id } }) },
    { label: "blocks", kind: "setNull", count: (id) => prisma.vineyardBlock.count({ where: { varietyId: id } }) },
  ],
  del: async (tx, id) => { await tx.variety.delete({ where: { id } }); },
  editable: [
    { name: "name", type: "string", min: 1, max: 80 },
    { name: "isActive", type: "boolean" },
    { name: "color", type: "string", max: 9 },
  ],
  current: (id) => prisma.variety.findUnique({ where: { id }, select: { name: true, isActive: true, color: true } }),
  update: async (tx, id, v) => { await tx.variety.update({ where: { id }, data: v as Prisma.VarietyUncheckedUpdateInput }); },
  creatable: [
    { name: "name", type: "string", required: true, min: 1, max: 80 },
    { name: "color", type: "string", max: 9 },
  ],
  buildCreate: async (_u, v) => ({ data: { name: String(v.name), ...(v.color ? { color: String(v.color) } : {}) }, label: String(v.name) }),
  create: async (tx, data) => (await tx.variety.create({ data: data as Prisma.VarietyUncheckedCreateInput, select: { id: true } })).id,
};

const location: EntityConfig = {
  name: "Location",
  displayName: "location",
  vineyardScoped: false,
  find: async (_u, q) =>
    (await prisma.location.findMany({ where: q ? { name: { contains: q, mode: "insensitive" } } : {}, take: 25, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((l) => ({ id: l.id, label: l.name, vineyardId: null })),
  load: async (id) => {
    const l = await prisma.location.findUnique({ where: { id }, select: { id: true, name: true } });
    return l ? { id: l.id, label: l.name, vineyardId: null } : null;
  },
  relations: [
    { label: "bottled-wine balances", kind: "restrict", count: (id) => prisma.bottledInventory.count({ where: { locationId: id } }) },
    { label: "goods balances", kind: "restrict", count: (id) => prisma.finishedGoodInventory.count({ where: { locationId: id } }) },
    { label: "stock movements", kind: "restrict", count: (id) => prisma.stockMovement.count({ where: { locationId: id } }) },
    { label: "bottling runs", kind: "restrict", count: (id) => prisma.bottlingRun.count({ where: { destinationLocationId: id } }) },
  ],
  del: async (tx, id) => { await tx.location.delete({ where: { id } }); },
  editable: [
    { name: "name", type: "string", min: 2, max: 80 },
    { name: "isActive", type: "boolean" },
  ],
  current: (id) => prisma.location.findUnique({ where: { id }, select: { name: true, isActive: true } }),
  update: async (tx, id, v) => { await tx.location.update({ where: { id }, data: v as Prisma.LocationUncheckedUpdateInput }); },
  creatable: [{ name: "name", type: "string", required: true, min: 2, max: 80 }],
  buildCreate: async (_u, v) => ({ data: { name: String(v.name) }, label: String(v.name) }),
  create: async (tx, data) => (await tx.location.create({ data: data as Prisma.LocationUncheckedCreateInput, select: { id: true } })).id,
};

const finishedGoodCategory: EntityConfig = {
  name: "FinishedGoodCategory",
  displayName: "category",
  vineyardScoped: false,
  find: async (_u, q) =>
    (await prisma.finishedGoodCategory.findMany({ where: q ? { name: { contains: q, mode: "insensitive" } } : {}, take: 25, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((c) => ({ id: c.id, label: c.name, vineyardId: null })),
  load: async (id) => {
    const c = await prisma.finishedGoodCategory.findUnique({ where: { id }, select: { id: true, name: true } });
    return c ? { id: c.id, label: c.name, vineyardId: null } : null;
  },
  relations: [
    { label: "finished goods", kind: "restrict", count: (id) => prisma.finishedGood.count({ where: { categoryId: id } }) },
    { label: "wine SKUs", kind: "setNull", count: (id) => prisma.wineSku.count({ where: { categoryId: id } }) },
  ],
  del: async (tx, id) => { await tx.finishedGoodCategory.delete({ where: { id } }); },
  editable: [
    { name: "name", type: "string", min: 2, max: 80 },
    { name: "isActive", type: "boolean" },
  ],
  current: (id) => prisma.finishedGoodCategory.findUnique({ where: { id }, select: { name: true, isActive: true } }),
  update: async (tx, id, v) => { await tx.finishedGoodCategory.update({ where: { id }, data: v as Prisma.FinishedGoodCategoryUncheckedUpdateInput }); },
  creatable: [{ name: "name", type: "string", required: true, min: 2, max: 80 }],
  buildCreate: async (_u, v) => ({ data: { name: String(v.name) }, label: String(v.name) }),
  create: async (tx, data) => (await tx.finishedGoodCategory.create({ data: data as Prisma.FinishedGoodCategoryUncheckedCreateInput, select: { id: true } })).id,
};

const vessel: EntityConfig = {
  name: "Vessel",
  displayName: "vessel",
  vineyardScoped: false,
  find: async (_u, q) =>
    (await prisma.vessel.findMany({ where: q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { blendName: { contains: q, mode: "insensitive" } }] } : {}, take: 25, orderBy: { code: "asc" }, select: { id: true, code: true, type: true } })).map((v) => ({ id: v.id, label: `${v.type === "BARREL" ? "Barrel" : "Tank"} ${v.code}`, vineyardId: null })),
  load: async (id) => {
    const v = await prisma.vessel.findUnique({ where: { id }, select: { id: true, code: true, type: true } });
    return v ? { id: v.id, label: `${v.type === "BARREL" ? "Barrel" : "Tank"} ${v.code}`, vineyardId: null } : null;
  },
  relations: [
    { label: "wine components", kind: "cascade", count: (id) => prisma.vesselComponent.count({ where: { vesselId: id } }) },
    { label: "bottling sources", kind: "restrict", count: (id) => prisma.bottlingSource.count({ where: { vesselId: id } }) },
  ],
  del: async (tx, id) => { await tx.vessel.delete({ where: { id } }); },
  editable: [
    { name: "code", type: "string", min: 1, max: 40 },
    { name: "blendName", type: "string", max: 80 },
    { name: "capacityL", type: "decimal", min: 0 },
    { name: "isActive", type: "boolean" },
    { name: "oakOrigin", type: "string", max: 40 },
    { name: "cooperage", type: "string", max: 80 },
    { name: "toastLevel", type: "string", max: 40 },
    { name: "cooperageYear", type: "int", min: 1900, max: 2100 },
  ],
  current: (id) => prisma.vessel.findUnique({ where: { id }, select: { code: true, blendName: true, capacityL: true, isActive: true, oakOrigin: true, cooperage: true, toastLevel: true, cooperageYear: true } }),
  update: async (tx, id, v) => { await tx.vessel.update({ where: { id }, data: v as Prisma.VesselUncheckedUpdateInput }); },
  creatable: [
    { name: "code", type: "string", required: true, min: 1, max: 40 },
    { name: "type", type: "enum", required: true, enumValues: ["BARREL", "TANK"] },
    { name: "capacityL", type: "decimal", required: true, min: 0 },
  ],
  buildCreate: async (_u, v) => ({ data: { code: String(v.code), type: String(v.type), capacityL: Number(v.capacityL) }, label: `${v.type === "BARREL" ? "Barrel" : "Tank"} ${v.code}` }),
  create: async (tx, data) => (await tx.vessel.create({ data: data as Prisma.VesselUncheckedCreateInput, select: { id: true } })).id,
};

const wineSku: EntityConfig = {
  name: "WineSku",
  displayName: "wine",
  vineyardScoped: false,
  find: async (_u, q) =>
    (await prisma.wineSku.findMany({ where: q ? { name: { contains: q, mode: "insensitive" } } : {}, take: 25, orderBy: [{ name: "asc" }, { vintage: "desc" }], select: { id: true, name: true, vintage: true } })).map((w) => ({ id: w.id, label: `${w.name} ${w.vintage}`, vineyardId: null })),
  load: async (id) => {
    const w = await prisma.wineSku.findUnique({ where: { id }, select: { id: true, name: true, vintage: true } });
    return w ? { id: w.id, label: `${w.name} ${w.vintage}`, vineyardId: null } : null;
  },
  relations: [
    { label: "bottling runs", kind: "restrict", count: (id) => prisma.bottlingRun.count({ where: { wineSkuId: id } }) },
    { label: "inventory balances", kind: "restrict", count: (id) => prisma.bottledInventory.count({ where: { wineSkuId: id } }) },
    { label: "stock movements", kind: "restrict", count: (id) => prisma.stockMovement.count({ where: { wineSkuId: id } }) },
  ],
  del: async (tx, id) => { await tx.wineSku.delete({ where: { id } }); },
  editable: [
    { name: "name", type: "string", min: 2, max: 80 },
    { name: "vintage", type: "int", min: 1900, max: 2100 },
    { name: "isActive", type: "boolean" },
  ],
  current: (id) => prisma.wineSku.findUnique({ where: { id }, select: { name: true, vintage: true, isActive: true } }),
  update: async (tx, id, v) => { await tx.wineSku.update({ where: { id }, data: v as Prisma.WineSkuUncheckedUpdateInput }); },
  creatable: [
    { name: "name", type: "string", required: true, min: 2, max: 80 },
    { name: "vintage", type: "int", required: true, min: 1900, max: 2100 },
  ],
  buildCreate: async (_u, v) => ({ data: { name: String(v.name), vintage: Number(v.vintage), bottleSizeMl: 750 }, label: `${v.name} ${v.vintage}` }),
  create: async (tx, data) => (await tx.wineSku.create({ data: data as Prisma.WineSkuUncheckedCreateInput, select: { id: true } })).id,
};

const finishedGood: EntityConfig = {
  name: "FinishedGood",
  displayName: "item",
  vineyardScoped: false,
  find: async (_u, q) =>
    (await prisma.finishedGood.findMany({ where: q ? { name: { contains: q, mode: "insensitive" } } : {}, take: 25, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((g) => ({ id: g.id, label: g.name, vineyardId: null })),
  load: async (id) => {
    const g = await prisma.finishedGood.findUnique({ where: { id }, select: { id: true, name: true } });
    return g ? { id: g.id, label: g.name, vineyardId: null } : null;
  },
  relations: [
    { label: "inventory balances", kind: "restrict", count: (id) => prisma.finishedGoodInventory.count({ where: { finishedGoodId: id } }) },
    { label: "stock movements", kind: "restrict", count: (id) => prisma.stockMovement.count({ where: { finishedGoodId: id } }) },
  ],
  del: async (tx, id) => { await tx.finishedGood.delete({ where: { id } }); },
  editable: [
    { name: "name", type: "string", min: 2, max: 80 },
    { name: "isActive", type: "boolean" },
  ],
  current: (id) => prisma.finishedGood.findUnique({ where: { id }, select: { name: true, isActive: true } }),
  update: async (tx, id, v) => { await tx.finishedGood.update({ where: { id }, data: v as Prisma.FinishedGoodUncheckedUpdateInput }); },
  creatable: [
    { name: "name", type: "string", required: true, min: 2, max: 80 },
    { name: "category", type: "string", required: true, description: "Category name the item belongs to." },
  ],
  buildCreate: async (_u, v) => {
    const cats = await prisma.finishedGoodCategory.findMany({ where: { name: { contains: String(v.category), mode: "insensitive" } }, take: 6, select: { id: true, name: true } });
    const cat = resolveExactlyOne(cats, { describe: (c) => c.name, noneMsg: `No category matches "${v.category}".`, manyMsg: `Several categories match "${v.category}"` });
    return { data: { name: String(v.name), categoryId: cat.id }, label: String(v.name) };
  },
  create: async (tx, data) => (await tx.finishedGood.create({ data: data as Prisma.FinishedGoodUncheckedCreateInput, select: { id: true } })).id,
};

// ───────────────────────── Registry ─────────────────────────

const ENTITIES: Record<string, EntityConfig> = {
  VineyardBlock: vineyardBlock,
  Vineyard: vineyard,
  Variety: variety,
  Location: location,
  FinishedGoodCategory: finishedGoodCategory,
  Vessel: vessel,
  WineSku: wineSku,
  FinishedGood: finishedGood,
};

/** Resolve an allowed entity by name (case-insensitive). Returns null for unknown
 *  or protected tables (AuditLog, User, Session, Account, Verification, inventory
 *  balance rows) — they are simply absent from the registry. */
export function getEntity(name: string): EntityConfig | null {
  if (!name) return null;
  const direct = ENTITIES[name];
  if (direct) return direct;
  const key = Object.keys(ENTITIES).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? ENTITIES[key] : null;
}

/** Names the assistant may CRUD — used to tell the model what's available. */
export function allowedEntityNames(): string[] {
  return Object.keys(ENTITIES);
}
