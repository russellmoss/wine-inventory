import { notFound } from "next/navigation";
import { isSparklingEnabled } from "@/lib/settings/data";
import { getEnTirageWorklist, getTirageCandidates, getActiveLocations, getLiqueurMaterials, getRecentlyFinishedSparkling } from "@/lib/sparkling/worklist-data";
import { EnTirageClient } from "./EnTirageClient";
import { HubSectionNav } from "@/components/nav/HubSectionNav";

export const metadata = { title: "En Tirage" };

// Gated by the sparkling capability (K14): off ⇒ the route 404s, so nothing sparkling is
// reachable even by direct URL.
async function EnTiragePageBody() {
  if (!(await isSparklingEnabled())) notFound();
  const [rows, candidates, locations, materials, finished] = await Promise.all([
    getEnTirageWorklist(),
    getTirageCandidates(),
    getActiveLocations(),
    getLiqueurMaterials(),
    getRecentlyFinishedSparkling(),
  ]);
  return <EnTirageClient rows={rows} candidates={candidates} locations={locations} materials={materials} finished={finished} />;
}

/** Plan 104 — this is a SECTION of /bottling, so it carries the same strip as its hub.
    Without it the strip is a one-way door: you use it once and it disappears. */
export default async function EnTiragePage() {
  return (
    <>
      <HubSectionNav hub="/bottling" current="/cellar/en-tirage" />
      <EnTiragePageBody />
    </>
  );
}
