"use server";

// Spray Intelligence S3a — server entry points for the spray record surface (Unit 13/14).
// Every action wraps its body in the tenant context (runAsTenant) and RETURNS { ok: false, error }
// rather than throwing — production redacts thrown ActionErrors (the WO-execute lesson).
// Also the verify:ai-native anchor for the read cores (mirrors weather/actions.ts).

import { prisma } from "@/lib/prisma";
import { requireReadyUser } from "@/lib/dal";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { resolveActiveTenantId } from "@/lib/tenant/resolve";
import { revalidatePath } from "next/cache";
import { settleWithCapture } from "@/lib/action-settle";
import { ActionError } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
// D9 vineyard-membership scoping. A spray pass may legitimately span sites, so the write gates check
// EVERY block named in the payload and the read gates check every vineyard a record touches.
import { requireBlocksAccess, requireSprayApplicationAccess, requireSprayBlockLineAccess, currentVineyardScope, narrowVineyardFilter } from "@/lib/vineyard/scope";
import { isTenantAdminLike } from "@/lib/access";
import { recordSprayApplicationCore, type SprayRecordResult } from "./record-core";
import { correctSprayApplicationCore, voidSprayApplicationCore, correctabilityOf, type Correctability } from "./correction-core";
import { createProductFactsResolver, createJurisdictionResolver } from "@/lib/pesticide/product-facts";
import { blockApplicationFacts, foldCurrentApplications, type BlockApplicationFacts } from "./read-core";
import { resolveDriedBeforeRain, type ResolvedDrying } from "./drying-core";
import { recordDryingOverrideCore } from "./drying-override-core";
import type {
  RecordSprayInput,
  SprayApplicationRow,
  SprayBlockLineRow,
  SprayDryingOverrideRow,
  SprayMaterialLineRow,
  SprayMobilityClass,
} from "./types";

// The callback receives the resolved tenantId so the write paths can build S2b's tenant-bound
// product-facts resolver. Existing zero-arg callers stay assignable.
//
// Settling goes through `settleWithCapture` rather than a local catch-all, which fixes two things this
// wrapper used to get wrong at once: it returned raw `e.message` to the browser (leaking whatever a
// Prisma or provider error happened to say), and it sent NOTHING to Sentry, so a real bug here was
// invisible. An expected ActionError still comes back verbatim with its code; an unexpected one is
// captured and replaced with a generic message. `unstable_rethrow` still runs first inside the helper,
// so a redirect from `requireReadyUser` stays a redirect (REDIRECT-1).
async function withTenant<T>(fn: (tenantId: string) => Promise<T>): Promise<ActionResult<T>> {
  return settleWithCapture(
    async () => {
      await requireReadyUser();
      const tenantId = await resolveActiveTenantId();
      if (!tenantId) {
        throw new ActionError("No active organization on your session — sign in to a winery first.", "FORBIDDEN");
      }
      return runAsTenant(tenantId, async () => await fn(tenantId));
    },
    { action: "spray.withTenant", area: "spray" },
  );
}

async function actor() {
  const user = await requireReadyUser();
  return { userId: user.id ?? null, email: user.email };
}

/**
 * Admin gate in this module's return-don't-throw idiom: hands back a failure RESULT to pass straight
 * through, or `null` to proceed. Deliberately not a throw — every action here returns `ActionResult` so
 * the message survives Next's production redaction (the file header's reason), and a thrown ActionError
 * from outside `withTenant` would bypass that. Called OUTSIDE any try, so `requireReadyUser`'s redirect
 * stays a redirect (REDIRECT-1).
 */
async function requireTenantAdmin(): Promise<{ ok: false; error: string; code: "FORBIDDEN" } | null> {
  const user = await requireReadyUser();
  if (!isTenantAdminLike(user)) {
    return { ok: false, error: "Only an admin or developer can change tenant-wide product facts.", code: "FORBIDDEN" };
  }
  return null;
}

// ── row coercion (Prisma Decimals → numbers, at the boundary) ──

function toAppRow(a: {
  id: string; vineyardId: string; status: string; revision: number;
  supersedesApplicationId: string | null; supersededByApplicationId: string | null;
  correctionKind: string | null; applicationMethod: string; startedAt: Date; finishedAt: Date | null;
  sprayVolumePerHaL: unknown; carrierWaterVolumeL: unknown; tankVolumeL: unknown;
}): SprayApplicationRow {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: a.id,
    vineyardId: a.vineyardId,
    status: a.status as SprayApplicationRow["status"],
    revision: a.revision,
    supersedesApplicationId: a.supersedesApplicationId,
    supersededByApplicationId: a.supersededByApplicationId,
    correctionKind: a.correctionKind as SprayApplicationRow["correctionKind"],
    applicationMethod: a.applicationMethod as SprayApplicationRow["applicationMethod"],
    startedAt: a.startedAt,
    finishedAt: a.finishedAt,
    sprayVolumePerHaL: num(a.sprayVolumePerHaL),
    carrierWaterVolumeL: num(a.carrierWaterVolumeL),
    tankVolumeL: num(a.tankVolumeL),
  };
}

function toMaterialRow(m: Record<string, unknown>): SprayMaterialLineRow {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    ...(m as unknown as SprayMaterialLineRow),
    quantityEntered: Number(m.quantityEntered),
    quantityCanonical: Number(m.quantityCanonical),
    snapshotRainfastHours: num(m.snapshotRainfastHours),
  };
}

function toBlockRow(b: Record<string, unknown>): SprayBlockLineRow {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    ...(b as unknown as SprayBlockLineRow),
    treatedAreaHa: Number(b.treatedAreaHa),
    volumeUsedL: num(b.volumeUsedL),
    computedVolumePerHaL: num(b.computedVolumePerHaL),
  };
}

// ── reads ──

export interface SpraySeasonRow {
  id: string;
  vineyardName: string;
  startedAt: Date;
  applicationMethod: string;
  status: string;
  revision: number;
  materialSummary: string;
  blockCount: number;
  factsUnknownCount: number;
}

/** The season list: CURRENT revisions first-class; superseded/voided reachable from the detail. */
export async function loadSpraySeasonList(vineyardId?: string | null): Promise<ActionResult<SpraySeasonRow[]>> {
  return withTenant(async () => {
    // D9: an explicit vineyardId must be IN scope (narrowVineyardFilter throws FORBIDDEN otherwise, so a
    // crafted id cannot widen the read); an absent one means "every vineyard I reach" — a LIST read
    // filters rather than throws, or a manager's season board would blank entirely.
    const { scope } = await currentVineyardScope();
    const only = narrowVineyardFilter(scope, vineyardId);
    const apps = await prisma.sprayApplication.findMany({
      where: only === null ? {} : { vineyardId: { in: only } },
      orderBy: { startedAt: "desc" },
      take: 200,
    });
    const current = foldCurrentApplications(apps);
    const ids = current.map((a) => a.id);
    const [materials, blocks, vineyards] = await Promise.all([
      prisma.sprayMaterialLine.findMany({ where: { applicationId: { in: ids } }, orderBy: { lineNo: "asc" } }),
      prisma.sprayBlockLine.findMany({ where: { applicationId: { in: ids } } }),
      prisma.vineyard.findMany({ where: { id: { in: [...new Set(current.map((a) => a.vineyardId))] } }, select: { id: true, name: true } }),
    ]);
    const vineyardName = new Map(vineyards.map((v) => [v.id, v.name]));
    return current.map((a) => {
      const ms = materials.filter((m) => m.applicationId === a.id);
      const bs = blocks.filter((b) => b.applicationId === a.id);
      return {
        id: a.id,
        vineyardName: vineyardName.get(a.vineyardId) ?? a.vineyardId,
        startedAt: a.startedAt,
        applicationMethod: a.applicationMethod,
        status: a.status,
        revision: a.revision,
        materialSummary: ms.map((m) => m.productName).join(" + ") || "—",
        blockCount: bs.length,
        factsUnknownCount: ms.filter((m) => m.factsCompleteness !== "KNOWN").length,
      };
    });
  });
}

export interface SprayDetail {
  application: SprayApplicationRow & {
    applicatorName: string;
    applicatorLicense: string | null;
    targetPest: string | null;
    windDirection: string | null;
    windSpeedKph: number | null;
    airTempC: number | null;
    weatherSource: string | null;
    notes: string | null;
    correctionReason: string | null;
    enteredByEmail: string;
    enteredAt: Date;
  };
  correctability: Correctability;
  /** The chain, oldest → newest, so a superseded revision is reachable and labelled. */
  chain: { id: string; revision: number; status: string; correctionKind: string | null; enteredAt: Date }[];
  materials: (SprayMaterialLineRow & { enteredActiveIngredient: string | null })[];
  mixOrder: { sequence: number; materialDescription: string; amountPerTankEntered: number | null; amountPerTankUnit: string | null }[];
  blocks: (BlockApplicationFacts & { drying: ResolvedDrying })[];
}

export async function loadSprayDetail(applicationId: string): Promise<ActionResult<SprayDetail>> {
  return withTenant(async () => {
    await requireSprayApplicationAccess(applicationId);
    const app = await prisma.sprayApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new Error("Spray record not found.");
    const [materialsRaw, blocksRaw, mixRaw] = await Promise.all([
      prisma.sprayMaterialLine.findMany({ where: { applicationId }, orderBy: { lineNo: "asc" } }),
      prisma.sprayBlockLine.findMany({ where: { applicationId }, orderBy: [{ startedAt: "asc" }, { blockLabelSnapshot: "asc" }] }),
      prisma.sprayMixOrderLine.findMany({ where: { applicationId }, orderBy: { sequence: "asc" } }),
    ]);
    const overridesRaw = await prisma.sprayDryingOverride.findMany({
      where: { blockLineId: { in: blocksRaw.map((b) => b.id) } },
      orderBy: { enteredAt: "asc" },
    });

    // Walk the chain both directions so every revision is reachable from any of them.
    const chain: SprayDetail["chain"] = [];
    let cursor: typeof app | null = app;
    while (cursor?.supersedesApplicationId) {
      cursor = await prisma.sprayApplication.findUnique({ where: { id: cursor.supersedesApplicationId } });
      if (cursor) chain.unshift({ id: cursor.id, revision: cursor.revision, status: cursor.status, correctionKind: cursor.correctionKind, enteredAt: cursor.enteredAt });
    }
    chain.push({ id: app.id, revision: app.revision, status: app.status, correctionKind: app.correctionKind, enteredAt: app.enteredAt });
    cursor = app;
    while (cursor?.supersededByApplicationId) {
      cursor = await prisma.sprayApplication.findUnique({ where: { id: cursor.supersededByApplicationId } });
      if (cursor) chain.push({ id: cursor.id, revision: cursor.revision, status: cursor.status, correctionKind: cursor.correctionKind, enteredAt: cursor.enteredAt });
    }

    const appRow = toAppRow(app);
    const materials = materialsRaw.map((m) => toMaterialRow(m as unknown as Record<string, unknown>));
    const blockRows = blocksRaw.map((b) => toBlockRow(b as unknown as Record<string, unknown>));
    const overrides = overridesRaw as unknown as SprayDryingOverrideRow[];

    return {
      application: {
        ...appRow,
        applicatorName: app.applicatorName,
        applicatorLicense: app.applicatorLicense,
        targetPest: app.targetPest,
        windDirection: app.windDirection,
        windSpeedKph: app.windSpeedKph == null ? null : Number(app.windSpeedKph),
        airTempC: app.airTempC == null ? null : Number(app.airTempC),
        weatherSource: app.weatherSource,
        notes: app.notes,
        correctionReason: app.correctionReason,
        enteredByEmail: app.enteredByEmail,
        enteredAt: app.enteredAt,
      },
      correctability: correctabilityOf(app),
      chain,
      materials: materials.map((m, i) => ({ ...m, enteredActiveIngredient: materialsRaw[i].enteredActiveIngredient })),
      mixOrder: mixRaw.map((x) => ({
        sequence: x.sequence,
        materialDescription: x.materialDescription,
        amountPerTankEntered: x.amountPerTankEntered == null ? null : Number(x.amountPerTankEntered),
        amountPerTankUnit: x.amountPerTankUnit,
      })),
      blocks: blockRows.map((b) => ({
        ...blockApplicationFacts(appRow, b, materials, blockRows),
        drying: resolveDriedBeforeRain(b, overrides.filter((o) => o.blockLineId === b.id)),
      })),
    };
  });
}

/** Blocks the form can target, with the derived default area pre-filled (KD-6). */
export async function loadSprayFormBlocks(): Promise<
  ActionResult<{ id: string; label: string; vineyardId: string; vineyardName: string; defaultAreaHa: number | null }[]>
> {
  return withTenant(async () => {
    // The picker must not offer blocks the caller cannot spray — otherwise the form hands them a target
    // that submitSprayRecord will (correctly) refuse, which reads as a broken screen rather than a denial.
    const { scope } = await currentVineyardScope();
    const only = narrowVineyardFilter(scope, null);
    const [blocks, vineyards] = await Promise.all([
      prisma.vineyardBlock.findMany({ where: only === null ? {} : { vineyardId: { in: only } }, select: { id: true, blockLabel: true, code: true, vineyardId: true, rowSpacingM: true, vineSpacingM: true, vineCount: true }, orderBy: { sortOrder: "asc" } }),
      prisma.vineyard.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    const { blockHectares } = await import("@/lib/vineyard/units");
    const vname = new Map(vineyards.map((v) => [v.id, v.name]));
    return blocks
      .filter((b) => vname.has(b.vineyardId))
      .map((b) => ({
        id: b.id,
        label: b.blockLabel?.trim() || b.code?.trim() || b.id,
        vineyardId: b.vineyardId,
        vineyardName: vname.get(b.vineyardId)!,
        defaultAreaHa: blockHectares(
          b.rowSpacingM == null ? null : Number(b.rowSpacingM),
          b.vineSpacingM == null ? null : Number(b.vineSpacingM),
          b.vineCount,
        ),
      }));
  });
}

// ── writes ──

export async function submitSprayRecord(input: RecordSprayInput): Promise<ActionResult<SprayRecordResult>> {
  const who = await actor();
  // S2b Unit 6 — THE composition root. This is where the null resolver is finally replaced; the
  // port and both cores are untouched (KD-6, function-argument DI). Registering it back-fills
  // nothing: existing records keep their frozen snapshots, and a clerical correction still copies
  // the predecessor verbatim (S3a council G1).
  const result = await withTenant(async (tenantId) => {
    // Gate on the BLOCKS, not the header vineyardId — the header is optional and merely "defaulted from
    // the first block line" (KD-12), so trusting it would let a manager name their own vineyard in the
    // header while spraying another site's blocks.
    // INSIDE withTenant on purpose: its catch turns a FORBIDDEN ActionError into { ok:false, error },
    // so the denial MESSAGE reaches the user. Thrown from out here it would escape this module's
    // return-don't-throw contract and Next would redact it to an opaque string (the file header's rule).
    await requireBlocksAccess(input.blockLines.map((l) => l.blockId));
    return recordSprayApplicationCore(who, input, {
      factsResolver: createProductFactsResolver(tenantId),
      jurisdictionResolver: createJurisdictionResolver(tenantId),
    });
  });
  if (result.ok) revalidatePath("/vineyards/sprays");
  return result;
}

export async function submitSprayCorrection(
  predecessorId: string,
  input: RecordSprayInput & { correctionReason: string },
): Promise<ActionResult<{ applicationId: string }>> {
  const who = await actor();
  const result = await withTenant(async (tenantId) => {
    // BOTH ends: the record being superseded and the blocks the replacement names. A correction can move
    // block lines, so checking only the predecessor would let a manager retarget a pass onto another site.
    // Inside withTenant so a denial returns { ok:false, error } instead of being redacted.
    await requireSprayApplicationAccess(predecessorId);
    await requireBlocksAccess(input.blockLines.map((l) => l.blockId));
    return correctSprayApplicationCore(who, predecessorId, input, {
      factsResolver: createProductFactsResolver(tenantId),
      jurisdictionResolver: createJurisdictionResolver(tenantId),
    });
  });
  if (result.ok) revalidatePath("/vineyards/sprays");
  return result;
}

export async function submitSprayVoid(applicationId: string, reason: string): Promise<ActionResult<{ applicationId: string }>> {
  const who = await actor();
  const result = await withTenant(async () => {
    await requireSprayApplicationAccess(applicationId); // inside: a denial must return, not throw
    return voidSprayApplicationCore(who, applicationId, reason);
  });
  if (result.ok) revalidatePath("/vineyards/sprays");
  return result;
}

export async function submitDryingOverride(input: { blockLineId: string; value: boolean; reason: string; observedAtIso: string }): Promise<ActionResult<{ id: string }>> {
  const who = await actor();
  const observedAt = new Date(input.observedAtIso);
  if (Number.isNaN(observedAt.getTime())) return { ok: false, error: "observedAt is not a valid instant.", code: "VALIDATION" };
  const result = await withTenant(async () => {
    await requireSprayBlockLineAccess(input.blockLineId); // inside: a denial must return, not throw
    return recordDryingOverrideCore(who, { blockLineId: input.blockLineId, value: input.value, reason: input.reason, observedAt });
  });
  if (result.ok) revalidatePath("/vineyards/sprays");
  return result.ok ? { ok: true, data: { id: result.data.id } } : result;
}

/** Map an existing record into the form's draft shape for the CORRECTION path (Unit 14) —
 * editing then submitting produces a full new revision through correctSprayApplicationCore;
 * there is no edit path to the original, by construction. */
export async function loadSprayFormInitial(applicationId: string): Promise<
  ActionResult<{
    predecessorId: string;
    correctability: Correctability;
    initial: import("@/app/(app)/vineyards/sprays/SprayForm").SprayFormInitial;
  }>
> {
  return withTenant(async () => {
    await requireSprayApplicationAccess(applicationId);
    const app = await prisma.sprayApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new Error("Spray record not found.");
    const [materials, mix, blockLines] = await Promise.all([
      prisma.sprayMaterialLine.findMany({ where: { applicationId }, orderBy: { lineNo: "asc" } }),
      prisma.sprayMixOrderLine.findMany({ where: { applicationId }, orderBy: { sequence: "asc" } }),
      prisma.sprayBlockLine.findMany({ where: { applicationId } }),
    ]);
    const materialLineNoById = new Map(materials.map((m) => [m.id, m.lineNo]));
    // Full ISO (UTC) — SprayForm converts to the BROWSER's wall time for datetime-local inputs
    // (QA finding: a truncated UTC string fed to datetime-local shifts every instant on resubmit).
    const local = (d: Date | null) => (d ? d.toISOString() : "");
    const str = (v: unknown) => (v == null ? "" : String(Number(v)));
    return {
      predecessorId: app.id,
      correctability: correctabilityOf(app),
      initial: {
        applicatorName: app.applicatorName,
        applicatorLicense: app.applicatorLicense ?? "",
        method: app.applicationMethod,
        startedAt: local(app.startedAt),
        finishedAt: local(app.finishedAt),
        targetPest: app.targetPest ?? "",
        sprayVolumePerHaL: str(app.sprayVolumePerHaL),
        windDirection: (app.windDirection ?? "") as "" | import("./types").SprayWindDirection,
        windSpeedKph: str(app.windSpeedKph),
        airTempC: str(app.airTempC),
        notes: app.notes ?? "",
        materials: materials.map((m) => ({
          productName: m.productName,
          epaRegistrationNumber: m.epaRegistrationNumber ?? "",
          tenantProductRef: m.tenantProductRef ?? "",
          materialRole: m.materialRole,
          quantityEntered: str(m.quantityEntered),
          quantityUnit: m.quantityUnit,
          quantityBasis: m.quantityBasis,
          // The stored line does not retain the entered denominator (canonical is per-ha / per-L);
          // default the pickers and let the corrector re-assert them — never silently guessed INTO
          // the record (the core re-validates on submit).
          perAreaUnit: "ACRE" as const,
          perCarrierValue: "100",
          perCarrierUnit: "GAL" as const,
          enteredReiHours: m.enteredReiHours == null ? "" : String(m.enteredReiHours),
          enteredPhiDays: m.enteredPhiDays == null ? "" : String(m.enteredPhiDays),
          enteredActiveIngredient: m.enteredActiveIngredient ?? "",
        })),
        mixLines: mix.map((x) => ({
          materialDescription: x.materialDescription,
          amountPerTankEntered: x.amountPerTankEntered == null ? "" : String(Number(x.amountPerTankEntered)),
          amountPerTankUnit: (x.amountPerTankUnit ?? "") as import("./types").SprayQuantityUnit | "",
          materialLineNo: x.materialLineId != null && materialLineNoById.has(x.materialLineId) ? String(materialLineNoById.get(x.materialLineId)) : "",
        })),
        blockDrafts: Object.fromEntries(
          blockLines.map((b) => [
            b.blockId,
            {
              selected: true,
              areaHa: String(Number(b.treatedAreaHa)),
              areaEdited: b.treatedAreaSource !== "DERIVED_FROM_SPACING",
              startedAt: local(b.startedAt),
              finishedAt: local(b.finishedAt),
              volumeUsedL: b.volumeUsedL == null ? "" : String(Number(b.volumeUsedL)),
            },
          ]),
        ),
      },
    };
  });
}

// ── S2b Unit 5 — the tenant-scoped grower-supplied product-facts entry surface ─────────────────
//
// KD-4: NOT behind isPesticideSourceEnabled — the toggle protects a registry source WE ship;
// gating a grower's own typed-in facts would re-brick the non-US tenant through the back door.
// KD-3: one row per (tenantId, productRef, factGroup) — a group is replaced whole, never blended.

export interface TenantProductFactsRow {
  id: string;
  productRef: string;
  productName: string;
  epaRegistrationNumber: string | null;
  factGroup: "REGULATORY" | "AGRONOMIC";
  worstCasePhiDays: number | null;
  worstCaseReiHours: number | null;
  minRepeatIntervalDays: number | null;
  maxApplicationsPerSeason: number | null;
  rainfastHours: number | null;
  mobilityClass: SprayMobilityClass | null;
  agronomicClass: string[];
  enteredBy: string;
  enteredAt: string;
  note: string | null;
}

export async function listTenantProductFacts(): Promise<ActionResult<TenantProductFactsRow[]>> {
  return withTenant(async () => {
    const rows = await prisma.tenantProductFacts.findMany({ orderBy: [{ productRef: "asc" }, { factGroup: "asc" }] });
    return rows.map((r) => ({
      id: r.id,
      productRef: r.productRef,
      productName: r.productName,
      epaRegistrationNumber: r.epaRegistrationNumber,
      factGroup: r.factGroup,
      worstCasePhiDays: r.worstCasePhiDays,
      worstCaseReiHours: r.worstCaseReiHours,
      minRepeatIntervalDays: r.minRepeatIntervalDays,
      maxApplicationsPerSeason: r.maxApplicationsPerSeason,
      rainfastHours: r.rainfastHours,
      mobilityClass: r.mobilityClass as SprayMobilityClass | null,
      agronomicClass: r.agronomicClass,
      enteredBy: r.enteredBy,
      enteredAt: r.enteredAt.toISOString(),
      note: r.note,
    }));
  });
}

function optNum(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A day/hour interval can be zero (apply-up-to-harvest, no wait) but never negative — a negative
 * PHI/REI/rainfast would make any future "elapsed >= minimum" legality check trivially pass
 * (adversarial review finding). Returns a field-labeled error rather than silently clamping. */
function optNonNegativeNum(v: FormDataEntryValue | null, label: string): { value: number | null; error: string | null } {
  const value = optNum(v);
  if (value != null && value < 0) return { value: null, error: `${label} cannot be negative.` };
  return { value, error: null };
}

/**
 * ADMIN-ONLY (and it must stay that way). This writes the tenant's REGULATORY product facts —
 * `worstCaseReiHours` (worker re-entry interval), `worstCasePhiDays` (pre-harvest interval),
 * `minRepeatIntervalDays`, `maxApplicationsPerSeason`. Those are worker-safety and food-safety values,
 * they are SNAPSHOTTED onto every spray record written afterwards, and they are what the app shows a
 * crew deciding whether a block is safe to enter or pick.
 *
 * It was gated by `actor()` → `requireReadyUser()` alone, so any authenticated user in the tenant could
 * set them. That is the authorization side of [[PEST-1]] ("a coverage gap never renders as no
 * restriction", CRITICAL): PEST-1 stops the DATA path from turning an unknown into a clearance, but an
 * unprivileged user could achieve the same thing by simply typing a number here. The invariant was
 * enforced against bad data and not against bad authorization.
 *
 * `TenantProductFacts` has no vineyard column, so this is deliberately NOT a D9 / VINEYARD-1 gate — it
 * is tenant-wide reference data, and the fence is the admin role. That exemption is recorded with its
 * reason in the ALLOWED map of `scripts/check-vineyard-scope.ts`.
 */
export async function upsertTenantProductFacts(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const gate = await requireTenantAdmin();
  if (gate) return gate;
  const who = await actor();
  const productRef = String(formData.get("productRef") ?? "").trim();
  const productName = String(formData.get("productName") ?? "").trim();
  const factGroup = String(formData.get("factGroup") ?? "") as "REGULATORY" | "AGRONOMIC";
  if (!productRef) return { ok: false, error: "A product reference is required — this is the handle you'll cite on a spray record.", code: "VALIDATION" };
  if (!productName) return { ok: false, error: "A product name is required.", code: "VALIDATION" };
  if (factGroup !== "REGULATORY" && factGroup !== "AGRONOMIC") return { ok: false, error: "Choose which group of facts this is: REGULATORY or AGRONOMIC.", code: "VALIDATION" };

  const epaRegistrationNumber = String(formData.get("epaRegistrationNumber") ?? "").trim() || null;
  const mobilityClassRaw = String(formData.get("mobilityClass") ?? "").trim();
  const mobilityClass: SprayMobilityClass | null =
    mobilityClassRaw === "CONTACT_PROTECTANT" || mobilityClassRaw === "TRANSLAMINAR" || mobilityClassRaw === "LOCALLY_SYSTEMIC" || mobilityClassRaw === "MOBILE_SYSTEMIC"
      ? mobilityClassRaw
      : null;
  const agronomicClass = String(formData.get("agronomicClass") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const note = String(formData.get("note") ?? "").trim() || null;

  const phi = optNonNegativeNum(formData.get("worstCasePhiDays"), "PHI");
  const rei = optNonNegativeNum(formData.get("worstCaseReiHours"), "REI");
  const repeat = optNonNegativeNum(formData.get("minRepeatIntervalDays"), "Minimum repeat interval");
  const maxApps = optNonNegativeNum(formData.get("maxApplicationsPerSeason"), "Max applications per season");
  const rainfast = optNonNegativeNum(formData.get("rainfastHours"), "Rainfast");
  const firstError = [phi, rei, repeat, maxApps, rainfast].find((r) => r.error)?.error;
  if (firstError) return { ok: false, error: firstError, code: "VALIDATION" };

  const data = {
    productRef,
    productName,
    epaRegistrationNumber,
    factGroup,
    worstCasePhiDays: phi.value,
    worstCaseReiHours: rei.value,
    minRepeatIntervalDays: repeat.value,
    maxApplicationsPerSeason: maxApps.value,
    rainfastHours: rainfast.value,
    mobilityClass,
    agronomicClass,
    note,
    enteredBy: who.email,
  };

  const result = await withTenant((tenantId) =>
    runInTenantTx(async (tx) => {
      // KD-3: one row per (tenantId, productRef, factGroup) — a native upsert on that composite
      // key, not a find-then-create/update: the latter is a check-then-set race (two concurrent
      // first-time submissions for the same productRef would both see "no existing row" and both
      // attempt create(), so the loser would 500 on the unique constraint instead of updating).
      const row = await tx.tenantProductFacts.upsert({
        where: { tenantId_productRef_factGroup: { tenantId, productRef, factGroup } },
        update: data,
        create: data,
      });
      return { id: row.id };
    }),
  );
  if (result.ok) revalidatePath("/vineyards/sprays/products");
  return result;
}
