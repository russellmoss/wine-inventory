import { loadPressFormData } from "@/lib/ferment/press-data";
import { loadCrushFormData } from "@/lib/ferment/crush-data";
import { PressClient } from "./PressClient";

export const dynamic = "force-dynamic";

export default async function PressPage() {
  // Press from a MUST lot (positions) OR straight from harvest fruit (whole-cluster, skips crush).
  const [pressData, crushData] = await Promise.all([loadPressFormData(), loadCrushFormData()]);
  return <PressClient positions={pressData.positions} vessels={pressData.vessels} blocks={crushData.blocks} materials={crushData.materials} />;
}
