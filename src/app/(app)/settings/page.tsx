import { getAppSettings } from "@/lib/settings/data";
import { prisma } from "@/lib/prisma";
import { SettingsClient } from "./SettingsClient";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [settings, profile] = await Promise.all([getAppSettings(), prisma.complianceProfile.findFirst()]);
  return (
    <SettingsClient
      sparklingEnabled={settings.sparklingEnabled}
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
        defaultCadence: profile?.defaultCadence ?? "MONTHLY",
      }}
    />
  );
}
