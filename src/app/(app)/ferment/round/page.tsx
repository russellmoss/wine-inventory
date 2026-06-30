import { loadRoundRows } from "@/lib/ferment/round-data";
import { RoundClient } from "./RoundClient";

// The Fermentation Round — the offline-first capture surface. Always fresh (ferment state moves
// fast); the client owns offline durability via the Dexie outbox.
export const dynamic = "force-dynamic";

export default async function RoundPage() {
  const rows = await loadRoundRows();
  return <RoundClient initialRows={rows} />;
}
