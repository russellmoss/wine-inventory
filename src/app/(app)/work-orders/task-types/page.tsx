import { requireReadyUser } from "@/lib/dal";
import { listUserTaskTypes } from "@/lib/work-orders/custom-log";
import { listOverlays } from "@/lib/work-orders/overlay-store";
import { TaskTypesClient } from "./TaskTypesClient";
import { HubSectionNav } from "@/components/nav/HubSectionNav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Task types" };

// Plan 053 C12: the task-builder admin surface — author record-only Custom Logs + customize built-in task
// fields (hide/relabel/reorder). Authoring is admin/owner-gated; everyone can still use the results.
async function TaskTypesPageBody() {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return <div style={{ padding: 24 }}>Your account isn&apos;t attached to a winery.</div>;
  const [customLogs, overlays] = await Promise.all([listUserTaskTypes(tenantId), listOverlays(tenantId)]);
  return <TaskTypesClient customLogs={customLogs} overlays={overlays} isAdmin={user.role === "admin" || user.role === "owner"} />;
}

/** Plan 104 — this is a SECTION of /work-orders, so it carries the same strip as its hub.
    Without it the strip is a one-way door: you use it once and it disappears. */
export default async function TaskTypesPage() {
  return (
    <>
      <HubSectionNav hub="/work-orders" current="/work-orders/task-types" />
      <TaskTypesPageBody />
    </>
  );
}
