import { requireReadyUser } from "@/lib/dal";
import { listBlendVessels, getTrialPrefill } from "@/lib/blend/data";
import { BlendBuilderClient } from "./BlendBuilderClient";

export const dynamic = "force-dynamic";

export default async function BlendPage({
  searchParams,
}: {
  searchParams: Promise<{ trial?: string }>;
}) {
  await requireReadyUser();
  const sp = await searchParams;
  const [vessels, prefill] = await Promise.all([
    listBlendVessels(),
    sp.trial ? getTrialPrefill(sp.trial) : Promise.resolve(null),
  ]);
  return <BlendBuilderClient vessels={vessels} prefill={prefill ?? undefined} />;
}
