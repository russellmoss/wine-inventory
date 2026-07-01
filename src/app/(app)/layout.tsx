import { requireReadyUser } from "@/lib/dal";
import { AppShell } from "@/components/AppShell";
import { countOpenSamples } from "@/lib/chemistry/data";
import { isSparklingEnabled } from "@/lib/settings/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireReadyUser();
  const [pendingSamples, sparklingEnabled] = await Promise.all([countOpenSamples(), isSparklingEnabled()]);
  return (
    <AppShell user={user} pendingSamples={pendingSamples} sparklingEnabled={sparklingEnabled}>
      {children}
    </AppShell>
  );
}
