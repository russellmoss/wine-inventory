import { loadCrushFormData } from "@/lib/ferment/crush-data";
import { CrushClient } from "./CrushClient";

export const dynamic = "force-dynamic";

export default async function CrushPage() {
  const data = await loadCrushFormData();
  return <CrushClient blocks={data.blocks} vessels={data.vessels} materials={data.materials} />;
}
