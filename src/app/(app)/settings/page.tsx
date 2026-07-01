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
        operatedByAddress: profile?.operatedByAddress ?? "",
        operatedByPhone: profile?.operatedByPhone ?? "",
      }}
    />
  );
}
