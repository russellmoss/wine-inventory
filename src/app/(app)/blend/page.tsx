import { requireReadyUser } from "@/lib/dal";
import { listBlendVessels } from "@/lib/blend/data";
import { BlendBuilderClient } from "./BlendBuilderClient";

export const dynamic = "force-dynamic";

export default async function BlendPage() {
  await requireReadyUser();
  const vessels = await listBlendVessels();
  return <BlendBuilderClient vessels={vessels} />;
}
