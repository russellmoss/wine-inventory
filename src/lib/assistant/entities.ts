import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/access";
import { findScopedBlocks, resolveVineyards } from "./scope";
import { withFields, type EntityField, type FieldSpec, type ValidatedValues } from "./fields";
import { resolveExactlyOne, resolveOneOrChoice, type ResolveResult } from "./tools/resolve";
import type { ChoiceRequest } from "./assistant-events";
import { assertBlockCascadeSafe, cascadeDeleteBlockChildrenTx } from "@/lib/vineyard/block-delete";

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
  /** restrict-only: a USER-CONFIRMED cascade (EntityConfig.cascadeRestrict) may remove this child, so
   *  db_delete offers a cascade instead of a hard refusal. Omit → this restrict child stays a hard wall. */
  cascadable?: boolean;
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
  /** Opt-in confirmed cascade: when `cascadable` restrict-children block the delete, db_delete offers a
   *  destructive cascade instead of refusing. `assertSafe` (read-only) throws a friendly ActionError if
   *  the cascade is unsafe (e.g. would strand lineage) — run at preview AND commit. `run` deletes the
   *  cascadable restrict-children within the tx, BEFORE the row itself. Entities WITHOUT this keep the
   *  hard refusal, so a restrict wall is only ever crossed where an entity explicitly allows it. */
  cascadeRestrict?: {
    assertSafe: (id: string) => Promise<void>;
    run: (tx: Prisma.TransactionClient, id: string) => Promise<void>;
  };

  // ── Optional create/update support (db_create / db_update) ──
  /** The ONE field table `creatable` and `editable` are derived from. Install all three with
   *  `...withFields(table)`. Present so the registry test can prove every create/update asymmetry
   *  was declared with a reason instead of drifting in silently (plan 082 Unit 2). */
  fields?: EntityField[];
  /** Fields accepted on create (validated by fields.ts; FK names resolved in buildCreate).
   *  DERIVED — install via `...withFields(table)`, never by hand. See `EntityField`. */
  creatable?: FieldSpec[];
  /** Resolve FK names + assemble the prisma `data` for a create. Async, pre-transaction. */
  buildCreate?: (user: AppUser, values: ValidatedValues) => Promise<{ data: Record<string, unknown>; label: string }>;
  /** Insert the row within a transaction; returns the new id. */
  create?: (tx: Prisma.TransactionClient, data: Record<string, unknown>) => Promise<string>;
  /** Master-data identity guard (NAMING-1). Given the assembled create `data`, return the conflicting
   *  row's presentation label if the create would duplicate an existing identity — e.g. a case-insensitive
   *  name match — else null. The existing row keeps its surrogate id: db_create NEVER re-keys or overwrites
   *  it, and surfaces a friendly "already exists" instead of a raw unique-constraint error (and never a
   *  silent case-variant duplicate — the DB uniques are case-sensitive, so this is the only guard). */
  findConflict?: (data: Record<string, unknown>) => Promise<{ label: string } | null>;
  /** Scalar fields the user may edit.
   *  DERIVED — populate via `...withFields(table)`, never by hand. See `EntityField`. */
  editable?: FieldSpec[];
  /** Current editable values, for diff/preview, or null if the row is gone. */
  current?: (id: string) => Promise<Record<string, unknown> | null>;
  /** Resolve FK NAMES in update values to ids, BEFORE the transaction — the mirror of `buildCreate`.
   *  `update` runs inside the tx and so cannot ask the user anything; resolution has to happen out
   *  here, where an ambiguous name can still return a clickable picker. Return the augmented values,
   *  or a ChoiceRequest to hand the user a picker instead of writing. Omit → values pass through. */
  buildUpdate?: (user: AppUser, values: ValidatedValues) => Promise<ValidatedValues | ChoiceRequest>;
  /** Keys that `buildUpdate` adds as plumbing (resolved FK ids). Hidden from the confirm card, which
   *  shows the human-readable sibling instead — nobody should have to confirm "varietyId: cmxyz…". */
  internalUpdateKeys?: string[];
  /** Apply validated edits within a transaction. */
  update?: (tx: Prisma.TransactionClient, id: string, values: ValidatedValues) => Promise<void>;
};

/**
 * Build a `findConflict` for a name-unique registry: match an existing row by CASE-INSENSITIVE name
 * (the DB unique is case-sensitive, so "syrah" would otherwise create a twin of "Syrah"). Runs on the
 * tenant-scoped extended client, so the match is per-tenant. The existing row is only READ — its identity
 * is never touched (NAMING-1).
 */
function nameConflict(
  lookup: (name: string) => Promise<{ name: string } | null>,
): (data: Record<string, unknown>) => Promise<{ label: string } | null> {
  return async (data) => {
    const name = String(data.name ?? "").trim();
    if (!name) return null;
    const row = await lookup(name);
    return row ? { label: row.name } : null;
  };
}

// ───────────────────────── Shared asymmetry rationales ─────────────────────────
// Reused `why` strings, so the same judgement is stated once and stays consistent.

/** A row is born active; deactivating is a lifecycle action, not a create-time field. */
const DEACTIVATE_ONLY = "A row is born active — deactivating is a lifecycle action, not a create-time field.";

/** Parent FK supplied BY NAME and resolved in buildCreate. Re-parenting is a different operation
 *  (it moves history with the row), so it is deliberately not a field edit. */
const PARENT_FK_ON_CREATE =
  "Parent FK, resolved by name in buildCreate. Re-parenting moves the row's history and is a distinct operation, not a field edit.";

/** Not a deliberate asymmetry — the same half-built shape plan 082 exists to fix, in another
 *  entity. Recorded honestly rather than blessed; changing it is out of scope for this unit,
 *  which must not alter behavior. */
const UNDECIDED_DRIFT =
  "NOT a deliberate asymmetry — never decided, just never added to the other list. Preserved as-is here because this unit is a pure refactor; see TODOS.md.";

/**
 * Resolve a grape-variety NAME to its id. Shared by the block's create and update paths so the two
 * cannot disagree about what "Merlot" means (Unit 3 — before this the resolver was inline in
 * buildCreate and update had no variety field at all).
 *
 * Returns a ResolveResult rather than throwing on ambiguity: an update runs through db_update, which
 * turns a `choice` into a CLICKABLE picker. A thrown paragraph would be a dead end — the same lesson
 * as #328, where prose "which one did you mean?" gave the user nothing to act on.
 */
export async function resolveVarietyId(name: string): Promise<ResolveResult<{ id: string; name: string }>> {
  const varieties = await prisma.variety.findMany({
    where: { name: { contains: name, mode: "insensitive" } },
    take: 6,
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  // An exact (case-insensitive) hit wins outright — "Merlot" must not open a picker just because
  // "Merlot Blanc" also exists.
  const exact = varieties.filter((v) => v.name.toLowerCase() === name.trim().toLowerCase());
  if (exact.length === 1) return { kind: "one", row: exact[0] };
  return resolveOneOrChoice(varieties, {
    prompt: `Which variety did you mean by "${name}"?`,
    describe: (v) => v.name,
    noneMsg: `No variety matches "${name}".`,
  });
}

// ───────────────────────── VineyardBlock ─────────────────────────
// Fields live in ONE table; `creatable`/`editable` are derived. Plan 082 Unit 2 — this config
// used to carry two hand-written arrays that drifted apart in opposite directions.

const blockFields: EntityField[] = [
  { name: "vineyard", type: "string", required: true, description: "Vineyard name the block belongs to.",
    mode: "create-only", why: PARENT_FK_ON_CREATE },
  { name: "blockLabel", type: "string", min: 1, max: 80, description: "Block label, e.g. 'Block 2'." },
  { name: "vineCount", type: "int", min: 0, description: "Number of vines." },
  { name: "yearPlanted", type: "int", min: 1900, max: 2100, description: "Year planted." },
  // Unit 3 made these five symmetric. `variety` arrives as a NAME on both paths and is resolved to
  // `varietyId` before the transaction (see resolveVarietyId / buildUpdate) — a mis-set variety used
  // to be permanently unfixable by the assistant.
  { name: "variety", type: "string", description: "Grape variety name." },
  { name: "numRows", type: "int", min: 0, description: "Number of rows." },
  { name: "clone", type: "string", max: 80, description: "Clone." },
  { name: "rootstock", type: "string", max: 80, description: "Rootstock." },
  { name: "irrigated", type: "boolean", description: "Whether the block is irrigated." },
];

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
    // BrixLog.block and HarvestRecord.block are onDelete: Restrict — a block with either cannot be
    // deleted until those are removed. They are `cascadable`: the user-confirmed cascade below can wipe
    // this vineyard-owned harvest history (ticket #188 test-data cleanup).
    { label: "Brix readings", kind: "restrict", cascadable: true, count: (id) => prisma.brixLog.count({ where: { blockId: id } }) },
    { label: "harvest records", kind: "restrict", cascadable: true, count: (id) => prisma.harvestRecord.count({ where: { blockId: id } }) },
    // work_order_task.blockId is onDelete: Restrict too, but a work order is NOT vineyard-owned harvest
    // data — never cascade-delete crew/operational records. Left non-cascadable so it stays a hard wall.
    { label: "work-order tasks", kind: "restrict", count: (id) => prisma.workOrderTask.count({ where: { blockId: id } }) },
    // Subblocks are onDelete: Cascade (they vanish with the block row). Listed so the confirmed-cascade
    // preview DISCLOSES them — before this entity was cascadable, a block with harvest history could
    // never be deleted, so subblocks never silently disappeared; now they can, so say so.
    { label: "subblocks", kind: "cascade", count: (id) => prisma.vineyardSubblock.count({ where: { blockId: id } }) },
  ],
  async del(tx, id) {
    await tx.vineyardBlock.delete({ where: { id } });
  },
  cascadeRestrict: {
    assertSafe: (id) => assertBlockCascadeSafe(id),
    run: (tx, id) => cascadeDeleteBlockChildrenTx(tx, id),
  },
  ...withFields(blockFields),
  async current(id) {
    const row = await prisma.vineyardBlock.findUnique({
      where: { id },
      select: {
        blockLabel: true, numRows: true, vineCount: true, yearPlanted: true, clone: true,
        rootstock: true, irrigated: true, varietyId: true,
        variety: { select: { name: true } },
      },
    });
    if (!row) return null;
    // Flatten the relation to a NAME so the before→after card reads "variety: Cabernet → Merlot".
    // `varietyId` rides along so the audit diff records a change rather than a bare addition.
    const { variety, ...rest } = row;
    return { ...rest, variety: variety?.name ?? null };
  },
  internalUpdateKeys: ["varietyId"],
  async buildUpdate(_user, values) {
    if (values.variety == null) return values;
    const res = await resolveVarietyId(String(values.variety));
    if (res.kind === "choice") return res.choice;
    // Store the CANONICAL name, not what the user typed — "merlot" confirms as "Merlot".
    return { ...values, variety: res.row.name, varietyId: res.row.id };
  },
  async update(tx, id, values) {
    // `variety` is the display name carried for the preview and audit; `varietyId` is the column.
    const data: Record<string, unknown> = { ...values };
    delete data.variety;
    await tx.vineyardBlock.update({ where: { id }, data: data as Prisma.VineyardBlockUncheckedUpdateInput });
  },
  async buildCreate(user, values) {
    const vineyards = await resolveVineyards(user, String(values.vineyard));
    const vineyard = resolveExactlyOne(vineyards, {
      describe: (v) => v.name,
      noneMsg: `No vineyard matches "${values.vineyard}" that you can access.`,
      manyMsg: `Several vineyards match "${values.vineyard}"`,
    });
    let varietyId: string | null = null;
    if (values.variety) {
      const res = await resolveVarietyId(String(values.variety));
      // db_create has no picker plumbing, so an ambiguous name still has to be a message here. The
      // shared resolver keeps the MATCHING rules identical to the update path; only the ambiguity
      // affordance differs.
      if (res.kind === "choice") {
        const names = res.choice.options.map((o) => o.label).join("; ");
        throw new Error(`Several varieties match "${values.variety}": ${names}. Please be more specific.`);
      }
      varietyId = res.row.id;
    }
    const data: Record<string, unknown> = {
      vineyardId: vineyard.id,
      blockLabel: values.blockLabel ?? null,
      varietyId,
      vineCount: values.vineCount ?? null,
      yearPlanted: values.yearPlanted ?? null,
      numRows: values.numRows ?? null,
      clone: values.clone ?? null,
      rootstock: values.rootstock ?? null,
      irrigated: values.irrigated ?? null,
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

/** Vineyard, Location and FinishedGoodCategory are all plain name-plus-active registries. */
const nameRegistryFields: EntityField[] = [
  { name: "name", type: "string", required: true, min: 2, max: 80 },
  { name: "isActive", type: "boolean", mode: "update-only", why: DEACTIVATE_ONLY },
];

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
    { label: "source-lot links", kind: "restrict", count: (id) => prisma.lotVineyard.count({ where: { vineyardId: id } }) },
    { label: "assigned managers", kind: "cascade", count: (id) => prisma.userVineyard.count({ where: { vineyardId: id } }) },
  ],
  del: async (tx, id) => { await tx.vineyard.delete({ where: { id } }); },
  ...withFields(nameRegistryFields),
  current: (id) => prisma.vineyard.findUnique({ where: { id }, select: { name: true, isActive: true } }),
  update: async (tx, id, v) => { await tx.vineyard.update({ where: { id }, data: v as Prisma.VineyardUncheckedUpdateInput }); },
  buildCreate: async (_user, v) => ({ data: { name: String(v.name) }, label: String(v.name) }),
  create: async (tx, data) => (await tx.vineyard.create({ data: data as Prisma.VineyardUncheckedCreateInput, select: { id: true } })).id,
  findConflict: nameConflict((name) =>
    prisma.vineyard.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { name: true } }),
  ),
};

// ───────────────────────── Global registries (admin-only to mutate) ─────────────────────────

const varietyFields: EntityField[] = [
  { name: "name", type: "string", required: true, min: 1, max: 80 },
  { name: "color", type: "string", max: 9 },
  { name: "isActive", type: "boolean", mode: "update-only", why: DEACTIVATE_ONLY },
];

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
  ...withFields(varietyFields),
  current: (id) => prisma.variety.findUnique({ where: { id }, select: { name: true, isActive: true, color: true } }),
  update: async (tx, id, v) => { await tx.variety.update({ where: { id }, data: v as Prisma.VarietyUncheckedUpdateInput }); },
  buildCreate: async (_u, v) => ({ data: { name: String(v.name), ...(v.color ? { color: String(v.color) } : {}) }, label: String(v.name) }),
  create: async (tx, data) => (await tx.variety.create({ data: data as Prisma.VarietyUncheckedCreateInput, select: { id: true } })).id,
  findConflict: nameConflict((name) =>
    prisma.variety.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { name: true } }),
  ),
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
  ...withFields(nameRegistryFields),
  current: (id) => prisma.location.findUnique({ where: { id }, select: { name: true, isActive: true } }),
  update: async (tx, id, v) => { await tx.location.update({ where: { id }, data: v as Prisma.LocationUncheckedUpdateInput }); },
  buildCreate: async (_u, v) => ({ data: { name: String(v.name) }, label: String(v.name) }),
  create: async (tx, data) => (await tx.location.create({ data: data as Prisma.LocationUncheckedCreateInput, select: { id: true } })).id,
  findConflict: nameConflict((name) =>
    prisma.location.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { name: true } }),
  ),
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
  ...withFields(nameRegistryFields),
  current: (id) => prisma.finishedGoodCategory.findUnique({ where: { id }, select: { name: true, isActive: true } }),
  update: async (tx, id, v) => { await tx.finishedGoodCategory.update({ where: { id }, data: v as Prisma.FinishedGoodCategoryUncheckedUpdateInput }); },
  buildCreate: async (_u, v) => ({ data: { name: String(v.name) }, label: String(v.name) }),
  create: async (tx, data) => (await tx.finishedGoodCategory.create({ data: data as Prisma.FinishedGoodCategoryUncheckedCreateInput, select: { id: true } })).id,
  findConflict: nameConflict((name) =>
    prisma.finishedGoodCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { name: true } }),
  ),
};

const vesselFields: EntityField[] = [
  { name: "code", type: "string", required: true, min: 1, max: 40 },
  { name: "capacityL", type: "decimal", required: true, min: 0 },
  { name: "type", type: "enum", required: true, enumValues: ["BARREL", "TANK"],
    mode: "create-only",
    why: "A barrel cannot become a tank — type fixes the vessel's identity and the meaning of its capacity." },
  // These five are the SAME half-built shape plan 082 exists to fix, in a different entity: cooperage
  // details you would obviously want when adding a barrel, but create only accepts code/type/capacity.
  { name: "blendName", type: "string", max: 80, mode: "update-only", why: UNDECIDED_DRIFT },
  { name: "oakOrigin", type: "string", max: 40, mode: "update-only", why: UNDECIDED_DRIFT },
  { name: "cooperage", type: "string", max: 80, mode: "update-only", why: UNDECIDED_DRIFT },
  { name: "toastLevel", type: "string", max: 40, mode: "update-only", why: UNDECIDED_DRIFT },
  { name: "cooperageYear", type: "int", min: 1900, max: 2100, mode: "update-only", why: UNDECIDED_DRIFT },
  { name: "isActive", type: "boolean", mode: "update-only", why: DEACTIVATE_ONLY },
];

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
  ...withFields(vesselFields),
  current: (id) => prisma.vessel.findUnique({ where: { id }, select: { code: true, blendName: true, capacityL: true, isActive: true, oakOrigin: true, cooperage: true, toastLevel: true, cooperageYear: true } }),
  update: async (tx, id, v) => { await tx.vessel.update({ where: { id }, data: v as Prisma.VesselUncheckedUpdateInput }); },
  buildCreate: async (_u, v) => ({ data: { code: String(v.code), type: String(v.type), capacityL: Number(v.capacityL) }, label: `${v.type === "BARREL" ? "Barrel" : "Tank"} ${v.code}` }),
  create: async (tx, data) => (await tx.vessel.create({ data: data as Prisma.VesselUncheckedCreateInput, select: { id: true } })).id,
};

const wineSkuFields: EntityField[] = [
  { name: "name", type: "string", required: true, min: 2, max: 80 },
  { name: "vintage", type: "int", required: true, min: 1900, max: 2100 },
  { name: "isActive", type: "boolean", mode: "update-only", why: DEACTIVATE_ONLY },
];

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
  ...withFields(wineSkuFields),
  current: (id) => prisma.wineSku.findUnique({ where: { id }, select: { name: true, vintage: true, isActive: true } }),
  update: async (tx, id, v) => { await tx.wineSku.update({ where: { id }, data: v as Prisma.WineSkuUncheckedUpdateInput }); },
  buildCreate: async (_u, v) => ({ data: { name: String(v.name), vintage: Number(v.vintage), bottleSizeMl: 750 }, label: `${v.name} ${v.vintage}` }),
  create: async (tx, data) => (await tx.wineSku.create({ data: data as Prisma.WineSkuUncheckedCreateInput, select: { id: true } })).id,
};

const finishedGoodFields: EntityField[] = [
  { name: "name", type: "string", required: true, min: 2, max: 80 },
  { name: "category", type: "string", required: true, description: "Category name the item belongs to.",
    mode: "create-only", why: PARENT_FK_ON_CREATE },
  { name: "isActive", type: "boolean", mode: "update-only", why: DEACTIVATE_ONLY },
];

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
  ...withFields(finishedGoodFields),
  current: (id) => prisma.finishedGood.findUnique({ where: { id }, select: { name: true, isActive: true } }),
  update: async (tx, id, v) => { await tx.finishedGood.update({ where: { id }, data: v as Prisma.FinishedGoodUncheckedUpdateInput }); },
  buildCreate: async (_u, v) => {
    const cats = await prisma.finishedGoodCategory.findMany({ where: { name: { contains: String(v.category), mode: "insensitive" } }, take: 6, select: { id: true, name: true } });
    const cat = resolveExactlyOne(cats, { describe: (c) => c.name, noneMsg: `No category matches "${v.category}".`, manyMsg: `Several categories match "${v.category}"` });
    return { data: { name: String(v.name), categoryId: cat.id }, label: String(v.name) };
  },
  create: async (tx, data) => (await tx.finishedGood.create({ data: data as Prisma.FinishedGoodUncheckedCreateInput, select: { id: true } })).id,
  // NOTE: FinishedGood has no name-unique constraint (two items may legitimately share a name across
  // categories), so there is intentionally NO findConflict guard here — one would wrongly block a create.
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
