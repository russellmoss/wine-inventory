import type { Prisma, PrismaClient } from "@prisma/client";
import { blockToken, normalizeToken, disambiguate } from "@/lib/lot/code";
import { getActiveTemplateSpec, renderLotCode, renderBlendLotCode } from "@/lib/lot/naming-template";

// Server-side lot-code assignment: compose the base human code (pure, from code.ts) and
// disambiguate it against existing lot codes via the DB. Takes a prisma client OR a
// transaction client, so callers run it inside their write transaction for consistency.
// No "server-only" so the bottling/reversal path and scripts can call it too.

type Db = PrismaClient | Prisma.TransactionClient;

export type GenerateLotCodeInput = {
  vintage: number;
  vineyardAbbr: string;
  varietyAbbr: string;
  blockCode?: string | null;
  blockLabel?: string | null;
  subblockCode?: string | null;
  subblockLabel?: string | null;
  tag?: string | null;
};

/** Compose the base code (via the tenant's active naming template), then return the first free
 *  `base` / `base-2` / `base-3` … The built-in default template delegates to `buildLotCode`, so a
 *  tenant with no custom template gets byte-for-byte identical output (Phase 1). */
export async function nextLotCode(db: Db, input: GenerateLotCodeInput): Promise<string> {
  const spec = await getActiveTemplateSpec(db);
  const base = renderLotCode(spec, {
    vintage: input.vintage,
    vineyardAbbr: input.vineyardAbbr,
    varietyAbbr: input.varietyAbbr,
    blockToken: blockToken(input.blockCode, input.blockLabel),
    subblockToken: normalizeToken(input.subblockCode ?? input.subblockLabel) || undefined,
    tag: input.tag ? normalizeToken(input.tag) : undefined,
  });
  const existing = await db.lot.findMany({ where: { code: { startsWith: base } }, select: { code: true } });
  return disambiguate(base, new Set(existing.map((e) => e.code)));
}

export type GenerateBlendLotCodeInput = { vintage?: number | null; token: string };

/**
 * Compose a blend base code (`[vintage]-BL-<TOKEN>`), then return the first free
 * `base` / `base-2` / `base-3` … against existing lot codes. Race-safe inside a tx.
 */
export async function nextBlendLotCode(db: Db, input: GenerateBlendLotCodeInput): Promise<string> {
  const spec = await getActiveTemplateSpec(db);
  const base = renderBlendLotCode(spec, { vintage: input.vintage, token: input.token });
  const existing = await db.lot.findMany({ where: { code: { startsWith: base } }, select: { code: true } });
  return disambiguate(base, new Set(existing.map((e) => e.code)));
}

/** True if a thrown error is a Prisma unique-constraint violation (P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
