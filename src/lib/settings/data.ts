import "server-only";
import { FeedbackAutomationMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COST_SETTINGS_DEFAULTS, type CostSettings } from "@/lib/cost/policy";
import { coerceCurrency, type CurrencyCode } from "@/lib/money/currency";

// Phase 12 (K10): per-org winery settings — one row per tenant. findFirst is tenant-scoped by the
// active tenant context (RLS + the Prisma extension), so it returns the calling org's row (default
// off when it doesn't exist yet); the toggle action upserts it by tenantId.

export type AppSettingsView = { sparklingEnabled: boolean };

export async function getAppSettings(): Promise<AppSettingsView> {
  const s = await prisma.appSettings.findFirst({ select: { sparklingEnabled: true } });
  return { sparklingEnabled: s?.sparklingEnabled ?? false };
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

/**
 * Phase 037: the one currency the whole tenant displays cost in. Coerced to the supported set (default
 * USD when the row is absent). Feeds the client CurrencyProvider so every cost field prefixes one symbol.
 */
export async function getTenantCurrency(): Promise<CurrencyCode> {
  const s = await prisma.appSettings.findFirst({ select: { currency: true } });
  return coerceCurrency(s?.currency);
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
