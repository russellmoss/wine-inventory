import { loadCrushFormData } from "@/lib/ferment/crush-data";
import { loadPressFormData } from "@/lib/ferment/press-data";
import { ProcessClient } from "./ProcessClient";

export const dynamic = "force-dynamic";

// Combined De-stem & Press. Harvest builds the fruit lot; here you either DE-STEM it (→ must,
// crusher rollers optional) or PRESS it (whole-cluster fruit → juice, or a must lot → fractions).
// The shared LotHarvestSource ledger enforces the rule: once fruit is pressed it's consumed (can't
// de-stem after), but de-stemmed must can still be pressed.
export default async function ProcessPage() {
  const [crushData, pressData] = await Promise.all([loadCrushFormData(), loadPressFormData()]);
  return (
    <ProcessClient
      blocks={crushData.blocks}
      vessels={crushData.vessels}
      materials={crushData.materials}
      positions={pressData.positions}
      pressVessels={pressData.vessels}
      pressCycles={pressData.pressCycles}
    />
  );
}
