import { getAppSettings, getCostSettings } from "@/lib/settings/data";
import { requireReadyUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { asOpsCadence, asReturnCadence } from "@/lib/compliance/types";
import { getConnectionSummary } from "@/lib/accounting/connection";
import { getAccountMappings, getApAccounts, getApPaymentAccounts } from "@/lib/accounting/coa";
import { getConnectionSummary as getCommerce7Summary } from "@/lib/commerce/connection";
import { getVoiceSettingsForUser } from "@/lib/voice/profile";
import { SettingsClient } from "./SettingsClient";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireReadyUser();
  const [settings, cost, profile, accounting, accountingMappings, accountingAp, accountingApPayment, commerce7, voice] = await Promise.all([
    getAppSettings(),
    getCostSettings(),
    prisma.complianceProfile.findFirst(),
    getConnectionSummary(),
    getAccountMappings(),
    getApAccounts(),
    getApPaymentAccounts(),
    getCommerce7Summary(),
    getVoiceSettingsForUser(user.id),
  ]);
  return (
    <SettingsClient
      sparklingEnabled={settings.sparklingEnabled}
      cost={cost}
      accounting={accounting}
      accountingMappings={accountingMappings}
      accountingAp={accountingAp}
      accountingApPayment={accountingApPayment}
      commerce7={commerce7}
      voice={voice}
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
