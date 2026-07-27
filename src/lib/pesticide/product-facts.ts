/**
 * Spray Intelligence S2b Unit 6 — the real `ProductFactsResolver`, replacing S3a's null one.
 *
 * This module is PURE COMPOSITION: it imports no prisma (K7 — the boundary test enforces that
 * `lookup.ts` is the lane's only prisma importer, and that is what makes the entitlement gate
 * un-routable-around). All reads arrive through the batched, individually gated functions in
 * `lookup.ts`.
 *
 * ⭐ KD-11 — resolution runs PER FACT GROUP, and the groups are assembled afterwards:
 *
 *   per (product, factGroup):
 *     tenant_product_facts row       -> TENANT_DEFINED / grower-supplied
 *     else curated registry row      -> REGISTRY / registry
 *     else                           -> that group unresolved (its fields stay null)
 *   then: resistanceGroups + activeIngredientKeys from S2's INDEPENDENTLY-refreshed registry data
 *   then: completeness derived by buildFactsSnapshot across the assembled result
 *
 * Three rules that are easy to get wrong and are each a safety property:
 *
 *  1. KD-10 STALENESS IS PER GROUP. A group past `reviewDueAt` has ITS OWN fields dropped and is
 *     flagged stale-at-write; sibling groups and S2's registry identity are untouched, because they
 *     are different sources on different cadences. A stale group can therefore never contribute a
 *     value, so it can never push completeness to KNOWN.
 *  2. KD-3 NO BLENDING WITHIN A GROUP. A tenant override replaces a whole group. Mixing a grower's
 *     PHI with a registry REI inside one group would produce a row no human reviewed as a coherent
 *     whole, and its provenance label would be a lie either way.
 *  3. NEVER THROW. `resolveMany` must be index-aligned with `keys` and answer UNKNOWN for anything
 *     it cannot resolve — unknown IS the answer (rule §3.6). A throw here would fail a spray WRITE.
 */

import {
  lookupProductFactsBatch,
  lookupRegistryIdentityBatch,
  lookupTenantProductFactsBatch,
  getPesticideFactsAsOf,
  resolveJurisdictionBatch,
} from "./lookup";
import type { JurisdictionResolver } from "@/lib/spray/jurisdiction-port";
import { parseRegistrationNumber } from "./reg-number";
import type {
  CuratedFactsRow,
  PesticideFactGroupValue,
  RegistryIdentityRow,
  TenantFactsRow,
} from "./types";
import type {
  ProductFactsAsOf,
  ProductFactsGroupProvenance,
  ProductFactsKey,
  ProductFactsResolver,
  ResolvedProductFacts,
} from "@/lib/spray/product-facts-port";
import { UNRESOLVED_PRODUCT_FACTS } from "@/lib/spray/product-facts-port";
import type { SprayFactsSource, SprayMobilityClass } from "@/lib/spray/types";

const MOBILITY: ReadonlySet<string> = new Set([
  "CONTACT_PROTECTANT",
  "TRANSLAMINAR",
  "LOCALLY_SYSTEMIC",
  "MOBILE_SYSTEMIC",
]);

/** Narrow a stored string to the port's enum, or null. Never coerces an unknown value into a class. */
function mobilityOf(raw: string | null): SprayMobilityClass | null {
  return raw != null && MOBILITY.has(raw) ? (raw as SprayMobilityClass) : null;
}

/** One group's resolved contribution. `null` fields mean "this group could not determine it". */
interface GroupResult {
  source: SprayFactsSource;
  asOf: Date | null;
  staleAtWrite: boolean;
  phiDays: number | null;
  reiHours: number | null;
  rainfastHours: number | null;
  mobilityClass: SprayMobilityClass | null;
  /** The curated artifact row that produced this, for the fifth-source watermark. */
  curatedId: string | null;
}

const EMPTY_GROUP: GroupResult = {
  source: "NONE",
  asOf: null,
  staleAtWrite: false,
  phiDays: null,
  reiHours: null,
  rainfastHours: null,
  mobilityClass: null,
  curatedId: null,
};

/**
 * KD-12: the scalar the frozen port carries is the WORST-CASE bound across activities, never the
 * scouting value. A 12-hour scouting REI served as "the" REI would send a crew in to tie vines
 * 36 hours early.
 */
export function worstCaseReiHours(row: Pick<CuratedFactsRow, "worstCaseReiHours" | "reiConditions">): number | null {
  const fromConditions = row.reiConditions.map((c) => c.hours).filter((h) => Number.isFinite(h));
  if (fromConditions.length) return Math.max(...fromConditions);
  return row.worstCaseReiHours;
}

/** Same discipline for PHI — the longest applicable interval is the safe scalar. */
export function worstCasePhiDays(row: Pick<CuratedFactsRow, "worstCasePhiDays" | "phiConditions">): number | null {
  const fromConditions = row.phiConditions.map((c) => c.days).filter((d) => Number.isFinite(d));
  if (fromConditions.length) return Math.max(...fromConditions);
  return row.worstCasePhiDays;
}

/** KD-10 — a group past its review date contributes NOTHING and says so. */
export function isStale(reviewDueAt: Date, now: Date): boolean {
  return reviewDueAt.getTime() < now.getTime();
}

function fromCurated(row: CuratedFactsRow, now: Date): GroupResult {
  if (isStale(row.reviewDueAt, now)) {
    return { ...EMPTY_GROUP, source: "REGISTRY", asOf: row.sourceAsOf, staleAtWrite: true };
  }
  const regulatory = row.factGroup === "REGULATORY";
  return {
    source: "REGISTRY",
    asOf: row.sourceAsOf,
    staleAtWrite: false,
    phiDays: regulatory ? worstCasePhiDays(row) : null,
    reiHours: regulatory ? worstCaseReiHours(row) : null,
    rainfastHours: regulatory ? null : row.rainfastHours,
    mobilityClass: regulatory ? null : mobilityOf(row.mobilityClass),
    curatedId: row.id,
  };
}

function fromTenant(row: TenantFactsRow): GroupResult {
  const regulatory = row.factGroup === "REGULATORY";
  return {
    // A grower-supplied row has no review cycle — the grower IS the source, and it is labelled
    // TENANT_DEFINED end to end so nothing can mistake it for registry data.
    source: "TENANT_DEFINED",
    asOf: row.enteredAt,
    staleAtWrite: false,
    phiDays: regulatory ? row.worstCasePhiDays : null,
    reiHours: regulatory ? row.worstCaseReiHours : null,
    rainfastHours: regulatory ? null : row.rainfastHours,
    mobilityClass: regulatory ? null : mobilityOf(row.mobilityClass),
    curatedId: null,
  };
}

function provenanceOf(g: GroupResult): ProductFactsGroupProvenance {
  return { source: g.source, asOf: g.asOf ? g.asOf.toISOString() : null, staleAtWrite: g.staleAtWrite };
}

/**
 * Assemble both groups plus the registry identity half into the single shape the frozen port wants.
 * `source` at the top level reports the STRONGEST claim any group makes, with TENANT_DEFINED winning
 * over REGISTRY — if any part of this snapshot is grower-supplied, the whole snapshot must say so.
 */
export function assembleResolved(args: {
  regulatory: GroupResult;
  agronomic: GroupResult;
  identity: RegistryIdentityRow | undefined;
  registryFactsAsOf: ProductFactsAsOf | null;
  productFactsArtifactSha256: string | null;
}): ResolvedProductFacts {
  const { regulatory, agronomic, identity, registryFactsAsOf } = args;
  const anyTenant = regulatory.source === "TENANT_DEFINED" || agronomic.source === "TENANT_DEFINED";
  const anyRegistry = regulatory.source === "REGISTRY" || agronomic.source === "REGISTRY" || identity != null;
  const source: SprayFactsSource = anyTenant ? "TENANT_DEFINED" : anyRegistry ? "REGISTRY" : "NONE";

  // The curated artifact is the FIFTH watermark component; it rides alongside S2's four rather than
  // overloading one of them (the contract's change rule).
  const newestCurated = [regulatory.asOf, agronomic.asOf]
    .filter((d): d is Date => d != null && !anyTenant)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const factsAsOf: ProductFactsAsOf | null = registryFactsAsOf
    ? {
        ...registryFactsAsOf,
        productFactsArtifactSha256: args.productFactsArtifactSha256,
        productFactsAsOf: newestCurated ? newestCurated.toISOString() : null,
      }
    : null;

  const resistanceGroups =
    identity?.resistance && identity.resistance.resolution === "CODED" && !identity.resistance.partialEvidence
      ? identity.resistance.codes.map((c) => `FRAC:${c}`)
      : null; // GAP or partial evidence is NOT an answer (K13 / rule §3.6)

  return {
    completeness: "UNKNOWN", // derived downstream by buildFactsSnapshot from actual content
    source,
    phiDays: regulatory.phiDays,
    reiHours: regulatory.reiHours,
    rainfastHours: agronomic.rainfastHours,
    mobilityClass: agronomic.mobilityClass,
    resistanceGroups,
    activeIngredientKeys: identity ? identity.activeIngredients.map((a) => a.name) : null,
    activeIngredients: identity ? identity.activeIngredients : null,
    factsAsOf,
    regulatory: provenanceOf(regulatory),
    agronomic: provenanceOf(agronomic),
  };
}

/** Pick the row for one group from a product's curated/tenant rows. */
function groupRow<T extends { factGroup: PesticideFactGroupValue }>(rows: T[], group: PesticideFactGroupValue): T | undefined {
  return rows.find((r) => r.factGroup === group);
}

/**
 * Build a resolver bound to one tenant.
 *
 * A FACTORY, not a bare object: the frozen `ProductFactsResolver` interface takes no tenantId (it
 * predates this lane), the entitlement gate needs one, and K12 forbids reading the ALS tenant inside
 * the resolution path. Binding it at construction is the only option that satisfies all three.
 */
export function createProductFactsResolver(tenantId: string, opts?: { now?: Date }): ProductFactsResolver {
  return {
    async resolveMany(keys: ProductFactsKey[]): Promise<ResolvedProductFacts[]> {
      const now = opts?.now ?? new Date();
      try {
        // Canonicalize EPA numbers through the SAME typed parser the legality read uses (K6). A
        // malformed number resolves to no canonical form at all, so it can never near-miss onto a
        // real product — it simply does not match.
        const canonicalByIndex = keys.map((k) => {
          if (!k.epaRegistrationNumber) return null;
          const parsed = parseRegistrationNumber(k.epaRegistrationNumber);
          return parsed.ok && parsed.format === "EPA_FEDERAL" ? parsed.canonical : null;
        });
        const canonicals = canonicalByIndex.filter((c): c is string => c != null);
        const refs = keys.map((k) => k.tenantProductRef).filter((r): r is string => !!r);

        const [curatedByReg, tenantRows, identityByReg, registryFactsAsOf] = await Promise.all([
          lookupProductFactsBatch({ tenantId, canonicalRegNumbers: canonicals, now }),
          lookupTenantProductFactsBatch({ tenantId, productRefs: refs, regNumbers: canonicals }),
          lookupRegistryIdentityBatch({ tenantId, canonicalRegNumbers: canonicals }),
          getPesticideFactsAsOf(),
        ]);

        return keys.map((key, i) => {
          const canonical = canonicalByIndex[i];
          const curated = canonical ? (curatedByReg[canonical] ?? []) : [];
          const tenant = tenantRows.filter(
            (r) => (key.tenantProductRef && r.productRef === key.tenantProductRef) || (canonical && r.epaRegistrationNumber === canonical),
          );

          // KD-3: per group, tenant wins WHOLE-GROUP; otherwise the curated registry row; else nothing.
          const build = (group: PesticideFactGroupValue): GroupResult => {
            const t = groupRow(tenant, group);
            if (t) return fromTenant(t);
            const c = groupRow(curated, group);
            if (c) return fromCurated(c, now);
            return EMPTY_GROUP;
          };

          const regulatory = build("REGULATORY");
          const agronomic = build("AGRONOMIC");
          const identity = canonical ? identityByReg[canonical] : undefined;
          if (regulatory.source === "NONE" && agronomic.source === "NONE" && !identity) {
            return { ...UNRESOLVED_PRODUCT_FACTS };
          }
          return assembleResolved({
            regulatory,
            agronomic,
            identity,
            registryFactsAsOf,
            productFactsArtifactSha256: regulatory.curatedId ?? agronomic.curatedId,
          });
        });
      } catch {
        // Never throw (the port's contract): a resolver failure must degrade the spray record to
        // UNKNOWN facts, not block the grower from recording what they actually applied.
        return keys.map(() => ({ ...UNRESOLVED_PRODUCT_FACTS }));
      }
    },
  };
}

/**
 * S2b Unit 1 — the real `JurisdictionResolver`, replacing S3a's null one at the same composition
 * root as the facts resolver above. `resolveJurisdictionBatch` already returns unset/unconfirmed as
 * `null` (KD-9); this factory only binds the tenantId and adapts the field names 1:1.
 */
export function createJurisdictionResolver(tenantId: string): JurisdictionResolver {
  return {
    async resolveMany(vineyardIds: string[]) {
      try {
        const byVineyard = await resolveJurisdictionBatch(tenantId, vineyardIds);
        const out: Record<string, { country: string; state: string | null } | null> = {};
        for (const id of vineyardIds) {
          const j = byVineyard[id];
          out[id] = j ? { country: j.country, state: j.state ?? null } : null;
        }
        return out;
      } catch {
        // Never throw — the port's contract mirrors the facts resolver (rule §3.6: unknown, not a block).
        const out: Record<string, null> = {};
        for (const id of vineyardIds) out[id] = null;
        return out;
      }
    },
  };
}
