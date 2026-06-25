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

// ───────────────────────── Registry ─────────────────────────

const ENTITIES: Record<string, EntityConfig> = {
  VineyardBlock: vineyardBlock,
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
