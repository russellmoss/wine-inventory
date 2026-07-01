import { getAppSettings } from "@/lib/settings/data";
import { SettingsClient } from "./SettingsClient";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const settings = await getAppSettings();
  return <SettingsClient sparklingEnabled={settings.sparklingEnabled} />;
}
