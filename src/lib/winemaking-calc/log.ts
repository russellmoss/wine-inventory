import "server-only";
import { Prisma, type CalculationSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import type { AppUser } from "@/lib/access";
import { CALC_ENGINE_VERSION } from "./units";

// Plan 040 PR2 Unit 12: the ONE server-side helper both front doors (page + assistant) call to
// append a CalculationLog row, plus the scoped read that powers the history surfaces.
//
// NOT re-exported from the engine barrel (index.ts) — that barrel is pure and imported by the
// client page. This module is `server-only` (touches Prisma). The client only ever imports the
// CalcHistoryRow TYPE from here (type-only import, erased at build).

export type LogCalculationInput = {
  /** The active org (tenant). The page action has it from ctx.actor.tenantId; the assistant hook
   *  passes user.activeOrganizationId. If null/empty we skip the write (nothing to scope the row to). */
  tenantId: string | null | undefined;
  userId: string;
  userEmail: string;
  calculatorId: string;
  section: string;
  inputs: unknown;
  output: unknown;
  /** The unit selections in play; defaults to {} when the calc has no unit fields. */
  unitsUsed?: unknown;
  source: CalculationSource;
  advisory?: boolean;
  danger?: boolean;
};

/**
 * Append a CalculationLog row for a completed calculation. BEST-EFFORT (LOCKED): wrapped in
 * try/catch — a log-write failure is logged to the server console and swallowed, NEVER thrown to
 * the caller. A calculator must always answer; losing one audit row beats denying the winemaker a
 * number. Runs inside runAsTenant so the extended prisma scopes + WITH-CHECKs the insert (the page
 * action is already in tenant context; the assistant hook is not — one path covers both).
 */
export async function logCalculation(input: LogCalculationInput): Promise<void> {
  const tenantId = input.tenantId;
  if (!tenantId) return; // no tenant → nothing to scope the row to; skip silently
  try {
    await runAsTenant(tenantId, () =>
      prisma.calculationLog.create({
        data: {
          tenantId, // explicit + matches the runAsTenant GUC (RLS WITH CHECK); extension would also inject it
          userId: input.userId,
          userEmail: input.userEmail,
          calculatorId: input.calculatorId,
          formulaId: input.calculatorId, // currently mirrors calculatorId (room for sub-formula ids later)
          section: input.section,
          inputs: (input.inputs ?? {}) as Prisma.InputJsonValue,
          output: (input.output ?? {}) as Prisma.InputJsonValue,
          unitsUsed: (input.unitsUsed ?? {}) as Prisma.InputJsonValue,
          source: input.source,
          engineVersion: CALC_ENGINE_VERSION, // forensic: proves code-bug vs user-error across fixes
          advisory: input.advisory ?? false,
          danger: input.danger ?? false,
        },
      }),
    );
  } catch (e) {
    // Best-effort: surface to server logs, never to the user.
    console.error("[logCalculation] best-effort audit write failed (result still returned):", e);
  }
}

/** A history row as rendered by the page panel + returned by the assistant history tool. */
export type CalcHistoryRow = {
  id: string;
  calculatorId: string;
  section: string;
  source: CalculationSource;
  inputs: unknown;
  output: unknown;
  advisory: boolean;
  danger: boolean;
  userEmail: string;
  engineVersion: string;
  createdAt: string;
};

/**
 * Recent calculations for the current user, scoped like query-brix: a non-admin sees ONLY their own
 * rows; an admin sees the whole tenant's. RLS scopes to the tenant regardless (runAsTenant); the
 * userId filter is the app-level own-vs-tenant narrowing. Returns [] when the user has no tenant.
 */
export async function queryCalculationHistory(
  user: AppUser,
  opts: { calculatorId?: string; limit?: number } = {},
): Promise<CalcHistoryRow[]> {
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return [];
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);
  const where: Prisma.CalculationLogWhereInput = {};
  if (user.role !== "admin") where.userId = user.id; // non-admin → own rows only
  if (opts.calculatorId) where.calculatorId = opts.calculatorId;
  return runAsTenant(tenantId, async () => {
    const rows = await prisma.calculationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, calculatorId: true, section: true, source: true, inputs: true, output: true,
        advisory: true, danger: true, userEmail: true, engineVersion: true, createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      calculatorId: r.calculatorId,
      section: r.section,
      source: r.source,
      inputs: r.inputs,
      output: r.output,
      advisory: r.advisory,
      danger: r.danger,
      userEmail: r.userEmail,
      engineVersion: r.engineVersion,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}
