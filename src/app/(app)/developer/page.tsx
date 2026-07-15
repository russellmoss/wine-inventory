import { requireDeveloper } from "@/lib/dal";
import {
  getDeveloperFeedbackData,
  getDeveloperFeedbackItem,
  getDeveloperTenantFeedbackPage,
  type DeveloperTenantFeedbackPage,
} from "@/lib/developer/feedback";
import { parseDeveloperWorkspaceQuery } from "@/lib/developer/workspace-query";
import { DeveloperWorkspace } from "./DeveloperWorkspace";

type DeveloperSearchParams = Record<string, string | string[] | undefined>;

export default async function DeveloperPage({
  searchParams,
}: {
  searchParams: Promise<DeveloperSearchParams>;
}) {
  await requireDeveloper();
  const query = parseDeveloperWorkspaceQuery(await searchParams);
  const exactTenant = Boolean(query.tenantId);
  const shellDataPromise = getDeveloperFeedbackData({
    queue: query.queue,
    text: query.q || undefined,
    severity: query.severity,
    triageClass: query.disposition,
    includeItems: !exactTenant && query.view !== "automation",
  });
  const selectedItemPromise =
    query.tenantId && query.source && query.item
      ? getDeveloperFeedbackItem({
          tenantId: query.tenantId,
          sourceType: query.source,
          id: query.item,
        })
      : Promise.resolve(null);

  let exactPage: DeveloperTenantFeedbackPage | null = null;
  let cursorWasInvalid = false;
  if (query.tenantId && query.view !== "automation") {
    try {
      exactPage = await getDeveloperTenantFeedbackPage({
        tenantId: query.tenantId,
        queue: query.queue,
        assistantCursor: query.assistantCursor,
        ticketCursor: query.ticketCursor,
        text: query.q || undefined,
        severity: query.severity,
        triageClass: query.disposition,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid feedback cursor.") {
        cursorWasInvalid = true;
        exactPage = await getDeveloperTenantFeedbackPage({
          tenantId: query.tenantId,
          queue: query.queue,
          text: query.q || undefined,
          severity: query.severity,
          triageClass: query.disposition,
        });
      } else if (error instanceof Error && error.message === "Tenant not found.") {
        exactPage = null;
      } else {
        throw error;
      }
    }
  }

  const [shellData, selectedItem] = await Promise.all([
    shellDataPromise,
    selectedItemPromise,
  ]);
  const items = exactPage?.items ?? shellData.items;
  const selectedIsInCurrentList = selectedItem
    ? items.some(
        (item) => item.id === selectedItem.id && item.sourceType === selectedItem.sourceType,
      )
    : false;

  return (
    <DeveloperWorkspace
      data={{ ...shellData, items, loadedCount: items.length }}
      exactPage={exactPage}
      query={query}
      selectedItem={selectedItem}
      selectedIsInCurrentList={selectedIsInCurrentList}
      notices={[
        ...(query.invalid.length
          ? [`Ignored invalid URL state: ${query.invalid.join(", ")}.`]
          : []),
        ...(cursorWasInvalid
          ? ["The paging cursor was invalid, so the first page is shown."]
          : []),
      ]}
    />
  );
}
