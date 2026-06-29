import { requireReadyUser } from "@/lib/dal";
import { listBlendVessels, listTrials } from "@/lib/blend/data";
import { TrialsClient, type TrialLotOption } from "./TrialsClient";

export const dynamic = "force-dynamic";

export default async function TrialsPage() {
  await requireReadyUser();
  const [vessels, trials] = await Promise.all([listBlendVessels(), listTrials()]);

  // Distinct lots currently in the cellar, for the component picker.
  const byLot = new Map<string, TrialLotOption>();
  for (const v of vessels)
    for (const r of v.residents) {
      if (!byLot.has(r.lotId)) {
        byLot.set(r.lotId, {
          lotId: r.lotId,
          code: r.code,
          label: [r.varietyName, r.vineyardName, r.vintageYear].filter(Boolean).join(" · ") || r.code,
        });
      }
    }
  const lots = [...byLot.values()].sort((a, b) => a.code.localeCompare(b.code));

  return <TrialsClient trials={trials} lots={lots} />;
}
