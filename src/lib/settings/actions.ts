"use server";

import { revalidatePath } from "next/cache";
import type { CostingMethod } from "@prisma/client";
import { adminAction } from "@/lib/actions";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import { COST_SETTINGS_DEFAULTS, type CostSettings } from "@/lib/cost/policy";
import { coerceCurrency } from "@/lib/money/currency";
import { ActionError } from "@/lib/action-error";
import { baseHomeCurrencyMismatch, baseHomeMismatchMessage } from "@/lib/accounting/currency-guard";
import { isCanonicalTimeZone } from "@/lib/work-orders/due-at";
import {
  parseAreaUnit,
  parseLengthUnit,
  parsePrecipitationUnit,
  parseTemperatureUnit,
  parseUnitSystem,
  parseVolumeUnit,
  parseWeightUnit,
  type UnitPrefsRow,
} from "@/lib/units/display";

// Phase 7 (K14): toggle the winery-level sparkling capability. Admin-only; audited. Revalidates
// the layout so the gated nav (En Tirage) appears/disappears immediately.
export const setSparklingEnabled = adminAction(async ({ actor }, enabled: boolean): Promise<{ sparklingEnabled: boolean }> => {
  await runInTenantTx(async (tx) => {
    await tx.appSettings.upsert({
      where: { tenantId: actor.tenantId },
      update: { sparklingEnabled: enabled },
      create: { sparklingEnabled: enabled }, // tenantId auto-injected; id defaults to a cuid
    });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "AppSettings", entityId: actor.tenantId, summary: `Sparkling program ${enabled ? "enabled" : "disabled"}` });
  });
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  revalidatePath("/cellar/en-tirage");
  return { sparklingEnabled: enabled };
});

// Plan 093 follow-on: toggle the custom-crush capability. Admin-only; audited. Revalidates the layout so
// the gated nav (Weigh-tags) + the Clients setup screen appear/disappear immediately.
export const setCustomCrushEnabled = adminAction(async ({ actor }, enabled: boolean): Promise<{ customCrushEnabled: boolean }> => {
  await runInTenantTx(async (tx) => {
    await tx.appSettings.upsert({
      where: { tenantId: actor.tenantId },
      update: { customCrushEnabled: enabled },
      create: { customCrushEnabled: enabled }, // tenantId auto-injected; id defaults to a cuid
    });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "AppSettings", entityId: actor.tenantId, summary: `Custom-crush program ${enabled ? "enabled" : "disabled"}` });
  });
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  revalidatePath("/vineyards/harvest/weigh-tags");
  return { customCrushEnabled: enabled };
});

// Plan 077: toggle the eager QBO vendor push (a vendor created in Cellarhand is pushed to QBO immediately).
// Admin-only; audited. Revalidates settings.
export const setPushVendorsToQbo = adminAction(async ({ actor }, enabled: boolean): Promise<{ pushVendorsToQbo: boolean }> => {
  await runInTenantTx(async (tx) => {
    await tx.appSettings.upsert({
      where: { tenantId: actor.tenantId },
      update: { pushVendorsToQbo: enabled },
      create: { pushVendorsToQbo: enabled }, // tenantId auto-injected; id defaults to a cuid
    });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "AppSettings", entityId: actor.tenantId, summary: `Eager QBO vendor push ${enabled ? "enabled" : "disabled"}` });
  });
  revalidatePath("/settings");
  return { pushVendorsToQbo: enabled };
});

/**
 * Set (or clear) the winery's OPERATING timezone. Admin-only; audited.
 *
 * `null` clears it, which is a real choice, not an error state: every reader then falls back to the
 * viewer's own browser zone, exactly as before this setting existed. A non-null value must be a
 * CANONICAL IANA id — `isCanonicalTimeZone` refuses legacy abbreviations like "EST", which format fine
 * but are fixed-offset with no daylight rule and would leave the winery an hour off for much of the year.
 *
 * Revalidates the layout, not just /settings: due times and the overdue/today buckets are rendered
 * against this zone all over the app, so a change has to reach every cached page.
 */
export const setWineryTimeZone = adminAction(
  async ({ actor }, input: { timeZone: string | null }): Promise<{ timeZone: string | null }> => {
    const raw = typeof input?.timeZone === "string" ? input.timeZone.trim() : null;
    const timeZone = raw === null || raw === "" ? null : raw;
    if (timeZone !== null && !isCanonicalTimeZone(timeZone)) {
      throw new ActionError(`"${timeZone}" isn't a recognized timezone. Pick one from the list.`, "VALIDATION");
    }
    await runInTenantTx(async (tx) => {
      await tx.appSettings.upsert({
        where: { tenantId: actor.tenantId },
        update: { timeZone },
        create: { timeZone }, // tenantId auto-injected; id defaults to a cuid
      });
      await writeAudit(tx, {
        ...actor,
        action: "UPDATE",
        entityType: "AppSettings",
        entityId: actor.tenantId,
        summary: timeZone ? `Winery timezone set to ${timeZone}` : "Winery timezone cleared (falls back to each viewer's own)",
      });
    });
    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return { timeZone };
  },
);

/**
 * Plan 098: save the tenant's display-unit preferences — the master system plus six per-dimension
 * overrides, atomically (the card saves the whole object, mirroring setWineryTimeZone's shape).
 *
 * NULL is a real value on every field: a NULL dimension follows the master, a NULL master means
 * "not configured" and every reader falls back to metric — exactly the pre-feature behavior.
 * Write-side validation is STRICT (the read side is permissive): a non-null value that isn't in
 * its dimension's union is refused, so the columns only ever hold parseable strings or NULL.
 * Display-only: no stored litre/°C/kg changes meaning anywhere.
 */
type UnitPrefsInput = {
  unitSystem: string | null;
  unitTemperature: string | null;
  unitPrecipitation: string | null;
  unitVolume: string | null;
  unitArea: string | null;
  unitLength: string | null;
  unitWeight: string | null;
};

const UNIT_DIMENSION_PARSERS = {
  unitSystem: parseUnitSystem,
  unitTemperature: parseTemperatureUnit,
  unitPrecipitation: parsePrecipitationUnit,
  unitVolume: parseVolumeUnit,
  unitArea: parseAreaUnit,
  unitLength: parseLengthUnit,
  unitWeight: parseWeightUnit,
} as const;

export const setUnitPrefs = adminAction(
  async ({ actor }, input: UnitPrefsInput): Promise<UnitPrefsRow> => {
    const next: Record<string, string | null> = {};
    for (const [field, parse] of Object.entries(UNIT_DIMENSION_PARSERS)) {
      const raw = input?.[field as keyof UnitPrefsInput];
      const trimmed = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
      if (trimmed === null) {
        next[field] = null;
        continue;
      }
      const parsed = parse(trimmed);
      if (parsed === null) {
        throw new ActionError(`"${trimmed}" isn't a valid value for ${field}.`, "VALIDATION");
      }
      next[field] = parsed;
    }
    await runInTenantTx(async (tx) => {
      const current = await tx.appSettings.findFirst({
        select: {
          unitSystem: true,
          unitTemperature: true,
          unitPrecipitation: true,
          unitVolume: true,
          unitArea: true,
          unitLength: true,
          unitWeight: true,
        },
      });
      const changed = Object.keys(next).filter(
        (k) => (current?.[k as keyof typeof current] ?? null) !== next[k],
      );
      if (changed.length === 0) return;
      await tx.appSettings.upsert({
        where: { tenantId: actor.tenantId },
        update: next,
        create: next, // tenantId auto-injected; id defaults to a cuid
      });
      const describe = (k: string) => `${k.replace(/^unit/, "").toLowerCase()} → ${next[k] ?? "auto"}`;
      await writeAudit(tx, {
        ...actor,
        action: "UPDATE",
        entityType: "AppSettings",
        entityId: actor.tenantId,
        summary: `Display units updated: ${changed.map(describe).join(", ")}`,
      });
    });
    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return next;
  },
);

// Phase 8 (Unit 9, D5/D17): save the per-tenant costing policy — method + which components capitalize.
// Admin-only; audited. The roll-up (Unit 4) already consults these via `isComponentCapitalized` /
// `resolveMethodAt`, so persisting here is what makes a toggle change move cost-per-bottle.
// D17: bump `costingPolicyVersion` whenever any policy field changes, so already-stamped cost rows keep
// their old version and closed history never re-values. Stamp `costingMethodEffectiveAt = now` only when
// the METHOD changes, so ops before the switch keep the historical method (resolveMethodAt contract).
type CostSettingsInput = {
  currency: string; // Phase 037: tenant currency (coerced to the supported set); NOT a policy-version input
  costingMethod: CostingMethod;
  capitalizeFruit: boolean;
  capitalizeBarrel: boolean;
  capitalizeLabor: boolean;
  capitalizeOverhead: boolean;
  capitalizePackaging: boolean;
};

export const saveCostSettings = adminAction(
  async ({ actor }, input: CostSettingsInput): Promise<CostSettings> => {
    let result: CostSettings = { ...COST_SETTINGS_DEFAULTS };
    await runInTenantTx(async (tx) => {
      const current = await tx.appSettings.findFirst({
        select: {
          costingMethod: true,
          costingMethodEffectiveAt: true,
          capitalizeFruit: true,
          capitalizeBarrel: true,
          capitalizeLabor: true,
          capitalizeOverhead: true,
          capitalizePackaging: true,
          costingPolicyVersion: true,
        },
      });
      const prev = current
        ? {
            costingMethod: current.costingMethod,
            capitalizeFruit: current.capitalizeFruit,
            capitalizeBarrel: current.capitalizeBarrel,
            capitalizeLabor: current.capitalizeLabor,
            capitalizeOverhead: current.capitalizeOverhead,
            capitalizePackaging: current.capitalizePackaging,
          }
        : {
            costingMethod: COST_SETTINGS_DEFAULTS.costingMethod,
            capitalizeFruit: COST_SETTINGS_DEFAULTS.capitalizeFruit,
            capitalizeBarrel: COST_SETTINGS_DEFAULTS.capitalizeBarrel,
            capitalizeLabor: COST_SETTINGS_DEFAULTS.capitalizeLabor,
            capitalizeOverhead: COST_SETTINGS_DEFAULTS.capitalizeOverhead,
            capitalizePackaging: COST_SETTINGS_DEFAULTS.capitalizePackaging,
          };

      const methodChanged = prev.costingMethod !== input.costingMethod;
      const policyChanged =
        methodChanged ||
        prev.capitalizeFruit !== input.capitalizeFruit ||
        prev.capitalizeBarrel !== input.capitalizeBarrel ||
        prev.capitalizeLabor !== input.capitalizeLabor ||
        prev.capitalizeOverhead !== input.capitalizeOverhead ||
        prev.capitalizePackaging !== input.capitalizePackaging;

      const prevVersion = current?.costingPolicyVersion ?? COST_SETTINGS_DEFAULTS.policyVersion;
      const nextVersion = policyChanged ? prevVersion + 1 : prevVersion;
      // Preserve the existing effective date unless the method actually changed this save.
      const effectiveAt = methodChanged ? new Date() : (current?.costingMethodEffectiveAt ?? null);

      // Currency is a label, not a costing policy input — persisted here but excluded from policyChanged (D17).
      const currency = coerceCurrency(input.currency);
      // Plan 073 hardening: the base currency MUST match a connected QBO company's home currency, or foreign
      // A/P bills would post with the wrong currency/rate. Block a change that would break that alignment.
      const qbo = await tx.accountingConnection.findFirst({ where: { provider: "QBO", status: "CONNECTED" }, select: { homeCurrency: true } });
      if (qbo && baseHomeCurrencyMismatch(currency, qbo.homeCurrency)) {
        throw new ActionError(baseHomeMismatchMessage(currency, qbo.homeCurrency ?? ""), "CONFLICT");
      }
      const data = {
        currency,
        costingMethod: input.costingMethod,
        costingMethodEffectiveAt: effectiveAt,
        capitalizeFruit: input.capitalizeFruit,
        capitalizeBarrel: input.capitalizeBarrel,
        capitalizeLabor: input.capitalizeLabor,
        capitalizeOverhead: input.capitalizeOverhead,
        capitalizePackaging: input.capitalizePackaging,
        costingPolicyVersion: nextVersion,
      };
      await tx.appSettings.upsert({
        where: { tenantId: actor.tenantId },
        update: data,
        create: data, // tenantId auto-injected; id defaults to a cuid
      });
      await writeAudit(tx, {
        ...actor,
        action: "UPDATE",
        entityType: "AppSettings",
        entityId: actor.tenantId,
        summary: policyChanged ? `Costing policy updated (v${nextVersion})` : "Costing policy saved (no change)",
      });
      result = {
        currency,
        costingMethod: input.costingMethod,
        costingMethodEffectiveAt: effectiveAt,
        capitalizeFruit: input.capitalizeFruit,
        capitalizeBarrel: input.capitalizeBarrel,
        capitalizeLabor: input.capitalizeLabor,
        capitalizeOverhead: input.capitalizeOverhead,
        capitalizePackaging: input.capitalizePackaging,
        policyVersion: nextVersion,
      };
    });
    revalidatePath("/settings");
    return result;
  },
);
