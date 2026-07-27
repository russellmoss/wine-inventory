"use server";

// Spray Intelligence S3a — server entry points for the spray record surface (Unit 13/14).
// Every action wraps its body in the tenant context (runAsTenant) and RETURNS { ok: false, error }
// rather than throwing — production redacts thrown ActionErrors (the WO-execute lesson).
// Also the verify:ai-native anchor for the read cores (mirrors weather/actions.ts).

import { prisma } from "@/lib/prisma";
import { requireReadyUser } from "@/lib/dal";
import { runAsTenant } from "@/lib/tenant/context";
import { resolveActiveTenantId } from "@/lib/tenant/resolve";
import { revalidatePath } from "next/cache";
import { recordSprayApplicationCore, type SprayRecordResult } from "./record-core";
import { correctSprayApplicationCore, voidSprayApplicationCore, correctabilityOf, type Correctability } from "./correction-core";
import { createProductFactsResolver } from "@/lib/pesticide/product-facts";
import { blockApplicationFacts, foldCurrentApplications, type BlockApplicationFacts } from "./read-core";
import { resolveDriedBeforeRain, type ResolvedDrying } from "./drying-core";
import { recordDryingOverrideCore } from "./drying-override-core";
import type {
  RecordSprayInput,
  SprayApplicationRow,
  SprayBlockLineRow,
  SprayDryingOverrideRow,
  SprayMaterialLineRow,
} from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// The callback receives the resolved tenantId so the write paths can build S2b's tenant-bound
// product-facts resolver. Existing zero-arg callers stay assignable.
async function withTenant<T>(fn: (tenantId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    await requireReadyUser();
    const tenantId = await resolveActiveTenantId();
    if (!tenantId) return { ok: false, error: "No active organization on your session — sign in to a winery first." };
    const data = await runAsTenant(tenantId, async () => await fn(tenantId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

async function actor() {
  const user = await requireReadyUser();
  return { userId: user.id ?? null, email: user.email };
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
    const apps = await prisma.sprayApplication.findMany({
      where: vineyardId ? { vineyardId } : {},
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
    const [blocks, vineyards] = await Promise.all([
      prisma.vineyardBlock.findMany({ select: { id: true, blockLabel: true, code: true, vineyardId: true, rowSpacingM: true, vineSpacingM: true, vineCount: true }, orderBy: { sortOrder: "asc" } }),
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
  const result = await withTenant((tenantId) =>
    recordSprayApplicationCore(who, input, { factsResolver: createProductFactsResolver(tenantId) }),
  );
  if (result.ok) revalidatePath("/vineyards/sprays");
  return result;
}

export async function submitSprayCorrection(
  predecessorId: string,
  input: RecordSprayInput & { correctionReason: string },
): Promise<ActionResult<{ applicationId: string }>> {
  const who = await actor();
  const result = await withTenant((tenantId) =>
    correctSprayApplicationCore(who, predecessorId, input, { factsResolver: createProductFactsResolver(tenantId) }),
  );
  if (result.ok) revalidatePath("/vineyards/sprays");
  return result;
}

export async function submitSprayVoid(applicationId: string, reason: string): Promise<ActionResult<{ applicationId: string }>> {
  const who = await actor();
  const result = await withTenant(() => voidSprayApplicationCore(who, applicationId, reason));
  if (result.ok) revalidatePath("/vineyards/sprays");
  return result;
}

export async function submitDryingOverride(input: { blockLineId: string; value: boolean; reason: string; observedAtIso: string }): Promise<ActionResult<{ id: string }>> {
  const who = await actor();
  const observedAt = new Date(input.observedAtIso);
  if (Number.isNaN(observedAt.getTime())) return { ok: false, error: "observedAt is not a valid instant." };
  const result = await withTenant(() => recordDryingOverrideCore(who, { blockLineId: input.blockLineId, value: input.value, reason: input.reason, observedAt }));
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
