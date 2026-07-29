import { requireReadyUser, isTenantAdminLike } from "@/lib/dal";
import { getReviewQueue } from "@/lib/work-orders/data";
import { ReviewClient } from "./ReviewClient";
import { HubSectionNav } from "@/components/nav/HubSectionNav";

export const dynamic = "force-dynamic";

async function WorkOrderReviewPageBody() {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId || !isTenantAdminLike(user)) {
    return <div style={{ maxWidth: 620, margin: "0 auto", padding: 24 }}>Only an admin can review work orders.</div>;
  }
  const queue = await getReviewQueue(tenantId);
  return <ReviewClient queue={queue} />;
}

/** Plan 104 — this is a SECTION of /work-orders, so it carries the same strip as its hub.
    Without it the strip is a one-way door: you use it once and it disappears. */
export default async function WorkOrderReviewPage() {
  return (
    <>
      <HubSectionNav hub="/work-orders" current="/work-orders/review" />
      <WorkOrderReviewPageBody />
    </>
  );
}
