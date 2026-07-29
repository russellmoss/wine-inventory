import { requireReadyUser } from "@/lib/dal";
import { listOpenSamples } from "@/lib/chemistry/data";
import { SamplesClient } from "./SamplesClient";
import { HubSectionNav } from "@/components/nav/HubSectionNav";

// The dedicated open-samples surface (Phase 4). Lists non-terminal samples awaiting a result;
// each row attaches a returned result to its lot. params/searchParams unused here.
async function SamplesPageBody() {
  await requireReadyUser();
  const samples = await listOpenSamples();
  return <SamplesClient samples={samples} />;
}

/** Plan 104 — this is a SECTION of /lots, so it carries the same strip as its hub.
    Without it the strip is a one-way door: you use it once and it disappears. */
export default async function SamplesPage() {
  return (
    <>
      <HubSectionNav hub="/lots" current="/samples" />
      <SamplesPageBody />
    </>
  );
}
