import { requireReadyUser } from "@/lib/dal";
import { listOpenSamples } from "@/lib/chemistry/data";
import { SamplesClient } from "./SamplesClient";

// The dedicated open-samples surface (Phase 4). Lists non-terminal samples awaiting a result;
// each row attaches a returned result to its lot. params/searchParams unused here.
export default async function SamplesPage() {
  await requireReadyUser();
  const samples = await listOpenSamples();
  return <SamplesClient samples={samples} />;
}
