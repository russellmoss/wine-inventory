import { notFound } from "next/navigation";
import { isSparklingEnabled } from "@/lib/settings/data";
import { getEnTirageWorklist, getTirageCandidates, getActiveLocations, getLiqueurMaterials } from "@/lib/sparkling/worklist-data";
import { EnTirageClient } from "./EnTirageClient";

export const metadata = { title: "En Tirage" };

// Gated by the sparkling capability (K14): off ⇒ the route 404s, so nothing sparkling is
// reachable even by direct URL.
export default async function EnTiragePage() {
  if (!(await isSparklingEnabled())) notFound();
  const [rows, candidates, locations, materials] = await Promise.all([
    getEnTirageWorklist(),
    getTirageCandidates(),
    getActiveLocations(),
    getLiqueurMaterials(),
  ]);
  return <EnTirageClient rows={rows} candidates={candidates} locations={locations} materials={materials} />;
}
