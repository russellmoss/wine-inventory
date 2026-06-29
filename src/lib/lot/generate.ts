import type { Prisma, PrismaClient } from "@prisma/client";
import { buildLotCode, buildBlendLotCode, blockToken, normalizeToken, disambiguate } from "@/lib/lot/code";

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

/** Compose the base code, then return the first free `base` / `base-2` / `base-3` … */
export async function nextLotCode(db: Db, input: GenerateLotCodeInput): Promise<string> {
  const base = buildLotCode({
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
  const base = buildBlendLotCode({ vintage: input.vintage, token: input.token });
  const existing = await db.lot.findMany({ where: { code: { startsWith: base } }, select: { code: true } });
  return disambiguate(base, new Set(existing.map((e) => e.code)));
}

/** True if a thrown error is a Prisma unique-constraint violation (P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
