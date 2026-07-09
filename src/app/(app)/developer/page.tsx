import { requireDeveloper } from "@/lib/dal";
import { getDeveloperFeedbackData } from "@/lib/developer/feedback";
import { DeveloperClient } from "./DeveloperClient";

export default async function DeveloperPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tenant?: string; offset?: string }>;
}) {
  await requireDeveloper();
  const params = await searchParams;
  const data = await getDeveloperFeedbackData({
    text: params.q,
    tenantQuery: params.tenant,
    tenantOffset: params.offset ? Number(params.offset) || 0 : 0,
  });
  return <DeveloperClient data={data} />;
}
