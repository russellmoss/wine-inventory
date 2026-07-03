import { getAppSettings, getCostSettings } from "@/lib/settings/data";
import { prisma } from "@/lib/prisma";
import { asOpsCadence, asReturnCadence } from "@/lib/compliance/types";
import { getConnectionSummary } from "@/lib/accounting/connection";
import { SettingsClient } from "./SettingsClient";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [settings, cost, profile, accounting] = await Promise.all([
    getAppSettings(),
    getCostSettings(),
    prisma.complianceProfile.findFirst(),
    getConnectionSummary(),
  ]);
  return (
    <SettingsClient
      sparklingEnabled={settings.sparklingEnabled}
      cost={cost}
      accounting={accounting}
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
