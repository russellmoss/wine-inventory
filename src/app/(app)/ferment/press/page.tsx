import { loadPressFormData } from "@/lib/ferment/press-data";
import { PressClient } from "./PressClient";

export const dynamic = "force-dynamic";

export default async function PressPage() {
  const data = await loadPressFormData();
  return <PressClient positions={data.positions} vessels={data.vessels} />;
}
