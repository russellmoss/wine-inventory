import { requireReadyUser } from "@/lib/dal";
import { AppShell } from "@/components/AppShell";
import { countOpenSamples } from "@/lib/chemistry/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireReadyUser();
  const pendingSamples = await countOpenSamples();
  return (
    <AppShell user={user} pendingSamples={pendingSamples}>
      {children}
    </AppShell>
  );
}
