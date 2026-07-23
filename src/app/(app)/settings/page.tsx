import { getAppSettings, getCostSettings, getPushVendorsToQbo, getWineryTimeZone } from "@/lib/settings/data";
import { listCanonicalTimeZones } from "@/lib/work-orders/due-at";
import { requireReadyUser, requireActiveTenant } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { asOpsCadence, asReturnCadence } from "@/lib/compliance/types";
import { getConnectionSummary } from "@/lib/accounting/connection";
import { getAccountMappings, getApAccounts, getApPaymentAccounts } from "@/lib/accounting/coa";
import { getConnectionSummary as getCommerce7Summary } from "@/lib/commerce/connection";
import { getVoiceSettingsForUser } from "@/lib/voice/profile";
import { listSourceSettings } from "@/lib/knowledge/subscriptions";
import { SettingsClient } from "./SettingsClient";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireReadyUser();
  await requireActiveTenant();
  const [settings, cost, profile, accounting, accountingMappings, accountingAp, accountingApPayment, commerce7, voice, pushVendorsToQbo, knowledgeSources, wineryTimeZone] = await Promise.all([
    getAppSettings(),
    getCostSettings(),
    prisma.complianceProfile.findFirst(),
    getConnectionSummary(),
    getAccountMappings(),
    getApAccounts(),
    getApPaymentAccounts(),
    getCommerce7Summary(),
    getVoiceSettingsForUser(user.id),
    getPushVendorsToQbo(),
    listSourceSettings(),
    getWineryTimeZone(),
  ]);
  return (
    <SettingsClient
      sparklingEnabled={settings.sparklingEnabled}
      pushVendorsToQbo={pushVendorsToQbo}
      cost={cost}
      accounting={accounting}
      accountingMappings={accountingMappings}
      accountingAp={accountingAp}
      accountingApPayment={accountingApPayment}
      commerce7={commerce7}
      voice={voice}
      knowledgeSources={knowledgeSources}
      wineryTimeZone={wineryTimeZone}
      timeZoneOptions={listCanonicalTimeZones()}
      complianceProfile={{
        ein: profile?.ein ?? "",
        registryNumber: profile?.registryNumber ?? "",
        operatedByName: profile?.operatedByName ?? "",
        address: {
          street1: profile?.operatedByStreet1 ?? "",
          street2: profile?.operatedByStreet2 ?? "",
          city: profile?.operatedByCity ?? "",
          state: profile?.operatedByState ?? "",
          zip: profile?.operatedByZip ?? "",
        },
        operatedByPhone: profile?.operatedByPhone ?? "",
        defaultCadence: asOpsCadence(profile?.defaultCadence ?? "MONTHLY"),
        defaultReturnCadence: asReturnCadence(profile?.defaultReturnCadence ?? "SEMIMONTHLY"),
        isEftPayer: profile?.isEftPayer ?? false,
      }}
    />
  );
}
