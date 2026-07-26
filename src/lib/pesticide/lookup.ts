/**
 * Spray S2 Unit 5 — THE entitlement + jurisdiction boundary for the pesticide master (K7/K12).
 *
 * This is the ONLY module under src/lib/pesticide/ that may import @/lib/prisma (enforced by
 * test/pesticide-boundaries.test.ts). It is the single choke point for S9, S10 AND S11: the S11
 * assistant tool must consume this service, not re-implement the check — do NOT add a second,
 * divergent gate there (council C7).
 *
 * Every exported read:
 *  1. checks the `epa-pesticide` subscription FIRST, before any pesticide query, failing closed;
 *  2. requires a jurisdiction — federal registration alone is NEVER a clearance (G2); outside CA the
 *     honest answer is `state-registration-unknown`, outside the US `jurisdiction-unsupported`
 *     (returned, never thrown — Bhutan is a live tenant, rule §3.9);
 *  3. resolves products by EXACT match on the canonical registration number only (K6 — no contains,
 *     no case-folding, no similarity; the boundary guard scans for fuzzy matchers);
 *  4. answers only from PUBLISHED revisions (C8) and returns the composite factsAsOf (K8/C1);
 *  5. applies K13's most-conservative resistance rollup — any constituent AI in GAP makes the
 *     product GAP, resolved codes travel only as labelled partial evidence.
 *
 * Tenant id comes from the caller's session / runAsTenant — a model-facing tool must never let the
 * model supply it. Never read the ALS tenant inside a cached fn (K12) — tenantId is an explicit arg.
 */

import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { parseRegistrationNumber } from "./reg-number";
import type {
  AiResistanceView,
  FederalStatusView,
  PesticideFactsAsOf,
  PesticideJurisdiction,
  PesticideSiteModifierValue,
  ProductResistanceView,
  RegistrationLookupResult,
  ResistanceResolutionValue,
  ResistanceSiteTypeValue,
  VineSiteContext,
} from "./types";

export const PESTICIDE_SOURCE_KEY = "epa-pesticide";

/** Subscription gate — override ?? defaultEnabled (the resolveEnabledSources rule). The source ships
 * defaultEnabled:false, so a tenant is entitled only by an explicit enabling subscription row. Any
 * missing piece (source not seeded, source inactive) fails CLOSED. */
export async function isPesticideSourceEnabled(tenantId: string): Promise<boolean> {
  const source = await prisma.knowledgeSource.findUnique({
    where: { key: PESTICIDE_SOURCE_KEY },
    select: { id: true, active: true, defaultEnabled: true },
  });
  if (!source || !source.active) return false;
  // Await INSIDE runAsTenant — a lazy PrismaPromise evaluated after the ALS scope exits sees no
  // tenant context (the subscriptions.ts NB).
  const sub = await runAsTenant(tenantId, async () => {
    return await prisma.knowledgeSourceSubscription.findFirst({
      where: { sourceId: source.id },
      select: { enabled: true },
    });
  });
  return sub?.enabled ?? source.defaultEnabled;
}

/** The composite factsAsOf (K8/C1): sources refresh on different cadences, so each component is the
 * latest value among PUBLISHED revisions. Null when nothing has ever been published. */
export async function getPesticideFactsAsOf(): Promise<PesticideFactsAsOf | null> {
  const published = await prisma.pesticideDataRevision.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { startedAt: "desc" },
    take: 25,
    select: { id: true, apprilAsOf: true, cdprAsOf: true, resistanceArtifactSha256: true },
  });
  if (published.length === 0) return null;
  return {
    publishedRevisionId: published[0].id,
    apprilAsOf: published.find((r) => r.apprilAsOf)?.apprilAsOf?.toISOString() ?? null,
    cdprAsOf: published.find((r) => r.cdprAsOf)?.cdprAsOf?.toISOString() ?? null,
    resistanceArtifactSha256: published.find((r) => r.resistanceArtifactSha256)?.resistanceArtifactSha256 ?? null,
  };
}

type ProductWithRelations = NonNullable<Awaited<ReturnType<typeof findProductByCanonical>>>;

function findProductByCanonical(canonical: string) {
  // EXACT match on the canonical string only (K6). sourceStatus ACTIVE — a WITHDRAWN_FROM_SOURCE
  // product must stop answering "registered" (K14).
  return prisma.pesticideProduct.findFirst({
    where: { epaRegNumber: canonical, sourceStatus: "ACTIVE" },
    include: {
      siteRegistrations: { where: { isGrape: true } },
      stateRegistrations: true,
      useRestrictions: true,
      ingredients: { include: { activeIngredient: true } },
      resistanceAssignments: true,
    },
  });
}

/** K13 — most-conservative product rollup. A directly-cited PRODUCT assignment (product-keyed table,
 * prose, or single-AI label — never AI_KEYED_TABLE, the DB CHECK guarantees it) wins; otherwise the
 * product resolves from its constituent AIs, and ANY AI without a CODED/NO_CODE_EXISTS resolution
 * (including an AI with no assignment row at all) makes the product GAP. */
async function resolveProductResistance(product: ProductWithRelations): Promise<ProductResistanceView | null> {
  const aiIds = product.ingredients.map((i) => i.activeIngredientId);
  if (aiIds.length === 0 && product.resistanceAssignments.length === 0) return null;

  const parents = product.ingredients
    .map((i) => i.activeIngredient.parentActiveIngredientId)
    .filter((id): id is string => id != null);
  const assignments = await prisma.pesticideResistanceAssignment.findMany({
    where: {
      subjectKind: "ACTIVE_INGREDIENT",
      scheme: "FRAC",
      activeIngredientId: { in: [...aiIds, ...parents] },
    },
  });
  const byAiId = new Map(assignments.map((a) => [a.activeIngredientId!, a]));

  const perAi: AiResistanceView[] = product.ingredients.map((i) => {
    // The curated salt/ester collapse (G5): an AI without its own assignment inherits its cited
    // parent's — naming normalization over one cited organism/compound, never genus inference (K5).
    const a = byAiId.get(i.activeIngredientId) ?? (i.activeIngredient.parentActiveIngredientId ? byAiId.get(i.activeIngredient.parentActiveIngredientId) : undefined);
    return {
      aiName: i.activeIngredient.name,
      pcCode: i.activeIngredient.pcCode,
      resolution: (a?.resolution ?? "GAP") as ResistanceResolutionValue,
      codes: a?.codes ?? [],
      siteType: (a?.siteType ?? "UNKNOWN") as ResistanceSiteTypeValue,
      derivedFrom: a?.derivedFrom ?? null,
    };
  });

  const direct = product.resistanceAssignments.find((a) => a.scheme === "FRAC");
  if (direct) {
    const rollup = rollUp(perAi);
    // A direct product citation never OVERRIDES a conservative rollup: if any constituent AI is GAP,
    // the product stays GAP (the premix rule counts against every group it contains).
    const resolution: ResistanceResolutionValue =
      rollup.resolution === "GAP" ? "GAP" : (direct.resolution as ResistanceResolutionValue);
    return {
      scheme: "FRAC",
      resolution,
      codes: direct.codes,
      partialEvidence: resolution === "GAP" && direct.codes.length > 0,
      siteType: direct.siteType as ResistanceSiteTypeValue,
      derivedFrom: direct.derivedFrom as ProductResistanceView["derivedFrom"],
      perAi,
    };
  }

  return { ...rollUp(perAi), scheme: "FRAC", derivedFrom: "AI_ROLLUP", perAi };
}

function rollUp(perAi: AiResistanceView[]): {
  resolution: ResistanceResolutionValue;
  codes: string[];
  partialEvidence: boolean;
  siteType: ResistanceSiteTypeValue;
} {
  const anyGap = perAi.some((a) => a.resolution === "GAP");
  const codedCodes = [...new Set(perAi.filter((a) => a.resolution === "CODED").flatMap((a) => a.codes))];
  if (anyGap) {
    // ⚑ K13: the codes that DID resolve are partial evidence, never the answer — a grower reading
    // them as a clean rotation breeds resistance to whatever the uncoded partner is.
    return { resolution: "GAP", codes: codedCodes, partialEvidence: codedCodes.length > 0, siteType: "UNKNOWN" };
  }
  const codedAis = perAi.filter((a) => a.resolution === "CODED");
  if (codedAis.length === 0) return { resolution: "NO_CODE_EXISTS", codes: [], partialEvidence: false, siteType: "UNKNOWN" };
  const siteTypes = new Set(codedAis.map((a) => a.siteType));
  return {
    resolution: "CODED",
    codes: codedCodes,
    partialEvidence: false,
    siteType: siteTypes.size === 1 ? codedAis[0].siteType : "UNKNOWN",
  };
}

function federalStatusOf(product: ProductWithRelations): FederalStatusView {
  return {
    registeredOnGrapes: product.siteRegistrations.length > 0,
    siteModifiers: [...new Set(product.siteRegistrations.map((s) => s.siteModifier as PesticideSiteModifierValue))],
    registrationStatus: product.registrationStatus,
  };
}

/**
 * The legality read. Jurisdiction is REQUIRED (K12) — there is no overload without it, and no
 * combination of partial knowledge produces `ok: true`.
 */
export async function lookupRegistration(opts: {
  tenantId: string;
  regNumber: string;
  jurisdiction: PesticideJurisdiction;
  vineSiteContext?: VineSiteContext;
}): Promise<RegistrationLookupResult> {
  // 1. Entitlement, before ANY pesticide query (K7).
  if (!(await isPesticideSourceEnabled(opts.tenantId))) return { ok: false, reason: "source-not-enabled" };

  // 2. Typed reg-number gate (K6/G4).
  const reg = parseRegistrationNumber(opts.regNumber);
  if (!reg.ok) return { ok: false, reason: "malformed-reg-number", detail: "not a recognized registration number format" };
  if (reg.format !== "EPA_FEDERAL") return { ok: false, reason: "unsupported-registration-format", format: reg.format };

  // 3. Jurisdiction gate (K12) — checked before data so a non-US tenant never depends on table state.
  const country = opts.jurisdiction.country?.trim().toUpperCase() ?? "";
  if (country !== "US") return { ok: false, reason: "jurisdiction-unsupported" };
  const state = opts.jurisdiction.state?.trim().toUpperCase() || null;

  // 4. Published-facts + exact-match resolution (C8/K6).
  const factsAsOf = await getPesticideFactsAsOf();
  if (!factsAsOf) return { ok: false, reason: "not-found" };
  const product = await findProductByCanonical(reg.canonical);
  if (!product) return { ok: false, reason: "not-found" };

  const federalStatus = federalStatusOf(product);

  // 5. Federal necessary-condition: registered on grapes at all…
  if (product.siteRegistrations.length === 0) return { ok: false, reason: "not-registered-on-grapes", factsAsOf };

  // …and for THIS vine context (⚑ G1). UNSPECIFIED counts for a bearing context (a bare "Grapes"
  // label is the normal bearing registration); a NON_BEARING-only product never does.
  const context: VineSiteContext = opts.vineSiteContext ?? "BEARING";
  const usableSites =
    context === "BEARING"
      ? product.siteRegistrations.filter((s) => s.siteModifier !== "NON_BEARING")
      : product.siteRegistrations;
  if (usableSites.length === 0) {
    return { ok: false, reason: "non-bearing-only", siteModifiers: federalStatus.siteModifiers, factsAsOf };
  }

  // 6. State conjunct (⚑ G2): only an explicit CDPR REGISTERED row clears it. S2 ships CA only.
  if (!state || state !== "CA") {
    return { ok: false, reason: "state-registration-unknown", state, federalStatus, factsAsOf };
  }
  const caRows = product.stateRegistrations.filter((r) => r.state === "CA");
  const caRegistered = caRows.some((r) => r.status === "REGISTERED");
  if (!caRegistered) {
    if (caRows.some((r) => r.status === "NOT_REGISTERED")) {
      return { ok: false, reason: "state-not-registered", state, federalStatus, factsAsOf };
    }
    // No row (product newer than the last CDPR run) or an explicit UNKNOWN row — absence of
    // knowledge is never a NO and never a clearance.
    return { ok: false, reason: "state-registration-unknown", state, federalStatus, factsAsOf };
  }

  // 7. Restrictions are subtractive; rows for this jurisdiction ride along in the payload.
  const restrictions = product.useRestrictions
    .filter((r) => r.state === state)
    .map((r) => ({ state: r.state, counties: r.counties, kind: r.kind, exception: r.exception, quote: r.quote }));

  const resistance = await resolveProductResistance(product);

  return {
    ok: true,
    data: {
      product: {
        epaRegNumber: product.epaRegNumber!,
        productName: product.productName,
        companyName: product.companyName,
        labelDate: product.labelDate?.toISOString() ?? null,
        pestCategoryRaw: product.pestCategoryRaw,
        registrationStatus: product.registrationStatus,
      },
      grapeSites: usableSites.map((s) => ({
        siteNameRaw: s.siteNameRaw,
        siteModifier: s.siteModifier as PesticideSiteModifierValue,
      })),
      state: { state, status: "REGISTERED" },
      restrictions,
      activeIngredients: product.ingredients.map((i) => ({
        name: i.activeIngredient.name,
        pcCode: i.activeIngredient.pcCode,
        percent: i.percent == null ? null : Number(i.percent),
      })),
      resistance,
    },
    factsAsOf,
    provenance: "registry",
  };
}
