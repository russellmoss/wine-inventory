import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Phase 1 (identity presentation) — cross-identifier resolve/search + the timeline reader (plan C3),
// plus the LotIdentifier write helpers (plan C4). NAMING-2 read-routing: every user-facing lookup by
// a human code resolves to the surrogate `id` FIRST, then loads by id — nothing downstream joins on
// the mutable `code`. Rename HISTORY is read from LotCodeEvent (the source of truth, plan Q13);
// LotIdentifier holds external/source ids + the single current-code convenience row.
//
// Read helpers use the tenant-scoped `prisma` singleton directly (repo convention, cf. lot/data.ts);
// the tx-composable write helpers take a Prisma.TransactionClient so they compose into a rename tx.

export const CURRENT_CODE_KIND = "current-code";

export type MatchType = "current-code" | "display-name" | "historical-code" | "legacy-identifier";

/** A cross-identifier search hit, carrying WHY it matched so the UI can render "formerly: X". */
export type LotSearchMatch = {
  lotId: string;
  matchType: MatchType;
  /** The value that actually matched the query (the historical code, the alias, etc.). */
  matchContext: string;
  currentCode: string;
  displayName: string | null;
};

export type LotAlias = { value: string; kind: string; sourceSystem: string | null };
export type LotIdentitySummary = { currentCode: string; displayName: string | null; aliases: LotAlias[] };

/** Timeline honesty (NAMING-2): what the snapshot recorded vs the immediate rename target vs current. */
export type AsRecorded = { asRecorded: string; renamedToImmediate?: string; currentCode: string };

// matchType priority for dedup (a lot surfaced by several signals keeps its strongest).
const PRIORITY: Record<MatchType, number> = {
  "current-code": 0,
  "display-name": 1,
  "historical-code": 2,
  "legacy-identifier": 3,
};

/**
 * Resolve/search lots by ANY known identifier — current code, displayName, historical codes
 * (LotCodeEvent), and legacy/source identifiers (LotIdentifier) — returning a disambiguation
 * envelope (council G4): a query hitting two lots (current vs historical, or a shared displayName)
 * is never silently collapsed. Three bounded, tenant-scoped, indexed queries, merged in memory.
 */
export async function searchLotsByIdentifier(
  query: string,
  opts?: { limit?: number },
): Promise<LotSearchMatch[]> {
  const db = prisma;
  const q = query.trim();
  if (!q) return [];
  const limit = opts?.limit ?? 10;
  const like: Prisma.StringFilter = { contains: q, mode: "insensitive" };

  const [lots, events, idents] = await Promise.all([
    db.lot.findMany({
      where: { OR: [{ code: like }, { displayName: like }] },
      select: { id: true, code: true, displayName: true },
      take: limit * 3,
    }),
    db.lotCodeEvent.findMany({
      where: { field: "code", OR: [{ fromValue: like }, { toValue: like }] },
      select: { lotId: true, fromValue: true, toValue: true },
      take: limit * 3,
    }),
    db.lotIdentifier.findMany({
      where: { value: like, NOT: { kind: CURRENT_CODE_KIND } },
      select: { lotId: true, value: true },
      take: limit * 3,
    }),
  ]);

  const qLower = q.toLowerCase();
  // lotId -> { matchType, matchContext, exact }
  const best = new Map<string, { matchType: MatchType; matchContext: string; exact: boolean }>();
  const consider = (lotId: string, matchType: MatchType, matchContext: string) => {
    const exact = matchContext.toLowerCase() === qLower;
    const prev = best.get(lotId);
    if (
      !prev ||
      PRIORITY[matchType] < PRIORITY[prev.matchType] ||
      (PRIORITY[matchType] === PRIORITY[prev.matchType] && exact && !prev.exact)
    ) {
      best.set(lotId, { matchType, matchContext, exact });
    }
  };

  for (const l of lots) {
    if (l.code.toLowerCase().includes(qLower)) consider(l.id, "current-code", l.code);
    if (l.displayName && l.displayName.toLowerCase().includes(qLower)) consider(l.id, "display-name", l.displayName);
  }
  for (const e of events) {
    // The historical code is whichever of from/to matched but is NOT the current code path.
    const hit = e.fromValue && e.fromValue.toLowerCase().includes(qLower) ? e.fromValue : e.toValue;
    consider(e.lotId, "historical-code", hit);
  }
  for (const i of idents) consider(i.lotId, "legacy-identifier", i.value);

  // Resolve current code + displayName for every surfaced lot (NAMING-2: resolve to id, then load).
  const lotIds = [...best.keys()];
  if (lotIds.length === 0) return [];
  const resolved = await db.lot.findMany({
    where: { id: { in: lotIds } },
    select: { id: true, code: true, displayName: true },
  });
  const byId = new Map(resolved.map((l) => [l.id, l]));

  const matches: LotSearchMatch[] = [];
  for (const [lotId, m] of best) {
    const lot = byId.get(lotId);
    if (!lot) continue; // RLS-filtered / deleted
    matches.push({
      lotId,
      matchType: m.matchType,
      matchContext: m.matchContext,
      currentCode: lot.code,
      displayName: lot.displayName ?? null,
    });
  }
  // Rank: exact-first, then by matchType priority, then code.
  matches.sort((a, b) => {
    const ax = a.matchContext.toLowerCase() === qLower ? 0 : 1;
    const bx = b.matchContext.toLowerCase() === qLower ? 0 : 1;
    if (ax !== bx) return ax - bx;
    if (PRIORITY[a.matchType] !== PRIORITY[b.matchType]) return PRIORITY[a.matchType] - PRIORITY[b.matchType];
    return a.currentCode.localeCompare(b.currentCode);
  });
  return matches.slice(0, limit);
}

/** The lot's current identity + its aliases (prior codes from LotCodeEvent + external identifiers). */
export async function describeLotIdentity(lotId: string): Promise<LotIdentitySummary | null> {
  const db = prisma;
  const lot = await db.lot.findUnique({ where: { id: lotId }, select: { code: true, displayName: true } });
  if (!lot) return null;
  const [priorEvents, externals] = await Promise.all([
    db.lotCodeEvent.findMany({
      where: { lotId, field: "code" },
      select: { fromValue: true },
      orderBy: { observedAt: "desc" },
    }),
    db.lotIdentifier.findMany({
      where: { lotId, NOT: { kind: CURRENT_CODE_KIND } },
      select: { value: true, kind: true, sourceSystem: true },
    }),
  ]);
  const aliases: LotAlias[] = [];
  const seen = new Set<string>();
  for (const e of priorEvents) {
    if (e.fromValue && e.fromValue !== lot.code && !seen.has(e.fromValue)) {
      seen.add(e.fromValue);
      aliases.push({ value: e.fromValue, kind: "prior-code", sourceSystem: null });
    }
  }
  for (const x of externals) {
    if (!seen.has(x.value)) {
      seen.add(x.value);
      aliases.push({ value: x.value, kind: x.kind, sourceSystem: x.sourceSystem });
    }
  }
  return { currentCode: lot.code, displayName: lot.displayName ?? null, aliases };
}

/**
 * Timeline honesty (NAMING-2 / council G7): given a line's as-recorded `snapshotCode`, return the
 * immediate rename target and the current code so the UI can render "A (renamed to B, currently C)"
 * — never the misleading "A → C" that skips B.
 */
export async function asRecordedWithRename(lotId: string, snapshotCode: string): Promise<AsRecorded> {
  const db = prisma;
  const lot = await db.lot.findUnique({ where: { id: lotId }, select: { code: true } });
  const currentCode = lot?.code ?? snapshotCode;
  if (snapshotCode === currentCode) return { asRecorded: snapshotCode, currentCode };
  const nextRename = await db.lotCodeEvent.findFirst({
    where: { lotId, field: "code", fromValue: snapshotCode },
    select: { toValue: true },
    orderBy: { observedAt: "asc" },
  });
  return {
    asRecorded: snapshotCode,
    renamedToImmediate: nextRename?.toValue,
    currentCode,
  };
}

// ─────────────────────── write helpers (tx-composable; plan C4) ───────────────────────

/**
 * Upsert an EXTERNAL/source identifier idempotently (Phase-3 re-import key). Not used by the app
 * rename path (that only touches LotCodeEvent + the current-code row). Keyed on the null-safe partial
 * uniques: (tenantId, value) for app-native, (tenantId, sourceSystem, sourceObjectType, value) for source.
 */
export async function recordIdentifierTx(
  tx: Prisma.TransactionClient,
  input: {
    lotId: string;
    kind: string;
    value: string;
    sourceSystem?: string | null;
    sourceObjectType?: string | null;
    isCurrent?: boolean;
  },
): Promise<void> {
  const existing = await tx.lotIdentifier.findFirst({
    where: {
      lotId: input.lotId,
      kind: input.kind,
      value: input.value,
      sourceSystem: input.sourceSystem ?? null,
    },
    select: { id: true },
  });
  if (existing) return; // idempotent
  await tx.lotIdentifier.create({
    data: {
      lotId: input.lotId,
      kind: input.kind,
      value: input.value,
      sourceSystem: input.sourceSystem ?? null,
      sourceObjectType: input.sourceObjectType ?? null,
      isCurrent: input.isCurrent ?? false,
    },
  });
}

/**
 * Keep the single `current-code` LotIdentifier row in sync with `Lot.code` on rename (plan Q13:
 * update in place, NOT a flip to prior-code — history lives in LotCodeEvent). Creates the row if a
 * legacy lot never got one.
 */
export async function setCurrentCodeTx(tx: Prisma.TransactionClient, lotId: string, newCode: string): Promise<void> {
  const existing = await tx.lotIdentifier.findFirst({
    where: { lotId, kind: CURRENT_CODE_KIND },
    select: { id: true },
  });
  if (existing) {
    await tx.lotIdentifier.update({ where: { id: existing.id }, data: { value: newCode, isCurrent: true } });
  } else {
    await tx.lotIdentifier.create({
      data: { lotId, kind: CURRENT_CODE_KIND, value: newCode, isCurrent: true },
    });
  }
}
