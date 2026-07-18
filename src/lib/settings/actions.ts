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
