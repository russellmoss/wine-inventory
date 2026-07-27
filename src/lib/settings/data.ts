import "server-only";
import { FeedbackAutomationMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COST_SETTINGS_DEFAULTS, type CostSettings } from "@/lib/cost/policy";
import { coerceCurrency, type CurrencyCode } from "@/lib/money/currency";
import { isRealTimeZone } from "@/lib/work-orders/due-at";
import { resolveUnitPrefs, type UnitPrefs, type UnitPrefsRow } from "@/lib/units/display";

const UNIT_PREF_COLUMNS = {
  unitSystem: true,
  unitTemperature: true,
  unitPrecipitation: true,
  unitVolume: true,
  unitArea: true,
  unitLength: true,
  unitWeight: true,
} as const;

// Phase 12 (K10): per-org winery settings — one row per tenant. findFirst is tenant-scoped by the
// active tenant context (RLS + the Prisma extension), so it returns the calling org's row (default
// off when it doesn't exist yet); the toggle action upserts it by tenantId.

export type AppSettingsView = { sparklingEnabled: boolean; customCrushEnabled: boolean };

export async function getAppSettings(): Promise<AppSettingsView> {
  const s = await prisma.appSettings.findFirst({ select: { sparklingEnabled: true, customCrushEnabled: true } });
  return { sparklingEnabled: s?.sparklingEnabled ?? false, customCrushEnabled: s?.customCrushEnabled ?? false };
}

export type FeedbackAutomationModes = {
  assistantFeedbackMode: FeedbackAutomationMode;
  bugReportMode: FeedbackAutomationMode;
  featureRequestMode: FeedbackAutomationMode;
};

export async function getFeedbackAutomationModes(): Promise<FeedbackAutomationModes> {
  const s = await prisma.appSettings.findFirst({
    select: {
      assistantFeedbackMode: true,
      bugReportMode: true,
      featureRequestMode: true,
    },
  });
  return {
    assistantFeedbackMode: s?.assistantFeedbackMode ?? FeedbackAutomationMode.AGENTIC_FIX,
    bugReportMode: s?.bugReportMode ?? FeedbackAutomationMode.REPORT_ONLY,
    featureRequestMode: s?.featureRequestMode ?? FeedbackAutomationMode.REPORT_ONLY,
  };
}

/** The capability gate for the ENTIRE traditional-method sparkling UI/nav (default off). */
export async function isSparklingEnabled(): Promise<boolean> {
  return (await getAppSettings()).sparklingEnabled;
}

/** Plan 093 follow-on: the capability gate for the custom-crush surfaces (Clients/Owners setup + the
 *  Weigh-tags nav). Default off — the whole model is inert until a winery opts in. */
export async function isCustomCrushEnabled(): Promise<boolean> {
  return (await getAppSettings()).customCrushEnabled;
}

/**
 * Phase 037: the one currency the whole tenant displays cost in. Coerced to the supported set (default
 * USD when the row is absent). Feeds the client CurrencyProvider so every cost field prefixes one symbol.
 */
export async function getTenantCurrency(): Promise<CurrencyCode> {
  const s = await prisma.appSettings.findFirst({ select: { currency: true } });
  return coerceCurrency(s?.currency);
}

/**
 * The winery's OPERATING clock (IANA zone), or null when an admin hasn't set one.
 *
 * Null is the meaningful default, not a missing value: every reader falls back to the VIEWER's browser
 * zone, which is the behaviour that shipped with the due-TIME feature (#472). Pair it with
 * `resolveOperatingTimeZone(wineryTz, viewerTz)` rather than defaulting it here, so the two-step
 * fallback stays in one place.
 */
export async function getWineryTimeZone(): Promise<string | null> {
  const s = await prisma.appSettings.findFirst({ select: { timeZone: true } });
  // A value that somehow got in without passing the write-side gate must not break a page render.
  return isRealTimeZone(s?.timeZone) ? s!.timeZone : null;
}

/**
 * Plan 098: the tenant's RESOLVED display-unit preferences. Never null — an unconfigured (or
 * junk-valued) row resolves to metric, which is exactly today's behavior. `resolveUnitPrefs` is
 * the only reader of the raw columns (read-side permissive, like `isRealTimeZone` above); pair
 * writes with `setUnitPrefs`, which validates strictly.
 */
export async function getUnitPrefs(): Promise<UnitPrefs> {
  const s = await prisma.appSettings.findFirst({ select: UNIT_PREF_COLUMNS });
  return resolveUnitPrefs(s);
}

/**
 * Plan 098: the RAW stored unit columns (nulls preserved), for the settings card only — it must
 * render "follows the master" for a NULL dimension, which the resolved shape can't express.
 * Every display surface wants `getUnitPrefs()` instead.
 */
export async function getUnitPrefsRaw(): Promise<UnitPrefsRow> {
  const s = await prisma.appSettings.findFirst({ select: UNIT_PREF_COLUMNS });
  return s ?? {};
}

/** Plan 077: per-tenant opt-in — eagerly create a QBO vendor when one is created in Cellarhand (default off;
 *  off means vendors are authored in QBO and Slice 1's pull brings them in). */
export async function getPushVendorsToQbo(): Promise<boolean> {
  const s = await prisma.appSettings.findFirst({ select: { pushVendorsToQbo: true } });
  return s?.pushVendorsToQbo ?? false;
}

// Phase 8 (Unit 2): the per-tenant costing policy. Falls back to COST_SETTINGS_DEFAULTS when the
// row doesn't exist yet, so cost roll-up works before the operator ever visits the settings screen.
export async function getCostSettings(): Promise<CostSettings> {
  const s = await prisma.appSettings.findFirst({
    select: {
      currency: true,
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
  if (!s) return { ...COST_SETTINGS_DEFAULTS };
  return {
    currency: s.currency,
    costingMethod: s.costingMethod,
    costingMethodEffectiveAt: s.costingMethodEffectiveAt,
    capitalizeFruit: s.capitalizeFruit,
    capitalizeBarrel: s.capitalizeBarrel,
    capitalizeLabor: s.capitalizeLabor,
    capitalizeOverhead: s.capitalizeOverhead,
    capitalizePackaging: s.capitalizePackaging,
    policyVersion: s.costingPolicyVersion,
  };
}
