import { requireReadyUser } from "@/lib/dal";
import { getReviewQueue } from "@/lib/work-orders/data";
import { ReviewClient } from "./ReviewClient";

export const dynamic = "force-dynamic";

export default async function WorkOrderReviewPage() {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId || user.role !== "admin") {
    return <div style={{ maxWidth: 620, margin: "0 auto", padding: 24 }}>Only an admin can review work orders.</div>;
  }
  const queue = await getReviewQueue(tenantId);
  return <ReviewClient queue={queue} />;
}
