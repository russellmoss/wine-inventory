import "server-only";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import type { ObjectContextHint, ResolvedObjectContext } from "./object-context";

// Turn the browser's CLAIM about which object it is showing into something the server has actually
// seen, inside the right tenant. Plan 105 U4 / DM-56.
//
// DELIBERATELY NOT CACHED, and the tenant is an EXPLICIT ARGUMENT.
//
// The leak this shape prevents is cache poisoning, not an RLS failure: tenant A asks for id X and
// primes a cache entry; tenant B asks for the same id and is served A's already-materialised title,
// even though Postgres RLS answered A's query perfectly correctly. That is invariant K12 — never
// read the ALS tenant inside a cached function; pass tenantId in. A per-request read of one row by
// primary key is cheap enough that caching it was never worth the class of bug it invites.
//
// NEVER THROWS. An unknown id, a foreign tenant's id, a deleted record and a dead database all
// resolve to null, because a pasted foreign URL must not 500 the dock for the rest of the session.

export async function resolveObjectContext(
  tenantId: string | null | undefined,
  hint: ObjectContextHint | null,
): Promise<ResolvedObjectContext | null> {
  if (!tenantId || !hint) return null;

  try {
    return await runAsTenant(tenantId, async () => {
      // Every branch is a primary-key read inside the tenant context, so RLS decides visibility and
      // a foreign id simply finds nothing. `await` before returning, so the tenant ALS scope is
      // still open when the query actually runs (invariant TENANT-3).
      switch (hint.entity) {
        case "lot": {
          const row = await prisma.lot.findUnique({ where: { id: hint.id }, select: { id: true, code: true } });
          return row ? { entity: "lot" as const, id: row.id, label: row.code } : null;
        }
        case "workOrder": {
          const row = await prisma.workOrder.findUnique({
            where: { id: hint.id },
            select: { id: true, number: true, title: true },
          });
          return row ? { entity: "workOrder" as const, id: row.id, label: `#${row.number} ${row.title}` } : null;
        }
        case "template": {
          const row = await prisma.workOrderTemplate.findUnique({
            where: { id: hint.id },
            select: { id: true, name: true },
          });
          return row ? { entity: "template" as const, id: row.id, label: row.name } : null;
        }
        case "vineyard": {
          const row = await prisma.vineyard.findUnique({ where: { id: hint.id }, select: { id: true, name: true } });
          return row ? { entity: "vineyard" as const, id: row.id, label: row.name } : null;
        }
        default: {
          const _exhaustive: never = hint.entity;
          return _exhaustive;
        }
      }
    });
  } catch {
    // Degrade to "no context". The turn proceeds exactly as it did before this feature existed.
    return null;
  }
}
