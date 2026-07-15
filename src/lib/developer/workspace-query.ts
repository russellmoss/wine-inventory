import type { DeveloperQueue } from "@/lib/developer/linear-links";

export const DEVELOPER_WORKSPACE_VIEWS = [
  "inbox",
  "ready",
  "tracked",
  "closed",
  "automation",
] as const;

export type DeveloperWorkspaceView = (typeof DEVELOPER_WORKSPACE_VIEWS)[number];
export type DeveloperWorkspaceSeverity = "P0" | "P1" | "P2";
export type DeveloperWorkspaceDisposition =
  | "DEFECT"
  | "MODEL_BEHAVIOR"
  | "PRODUCT_GAP"
  | "NOT_A_BUG"
  | "UNCLEAR";
export type DeveloperWorkspaceSource = "ASSISTANT_FEEDBACK" | "FEEDBACK_TICKET";

export type DeveloperWorkspaceQuery = {
  view: DeveloperWorkspaceView;
  queue: DeveloperQueue;
  tenantId: string | null;
  q: string;
  severity: DeveloperWorkspaceSeverity | null;
  disposition: DeveloperWorkspaceDisposition | null;
  source: DeveloperWorkspaceSource | null;
  item: string | null;
  assistantCursor: string | null;
  ticketCursor: string | null;
  invalid: string[];
};

type RawQuery = Record<string, string | string[] | undefined>;
type QueryPatch = Partial<
  Omit<DeveloperWorkspaceQuery, "queue" | "invalid"> & {
    view: DeveloperWorkspaceView;
  }
>;

const VIEW_TO_QUEUE: Record<Exclude<DeveloperWorkspaceView, "automation">, DeveloperQueue> = {
  inbox: "INBOX",
  ready: "READY",
  tracked: "TRACKED",
  closed: "CLOSED",
};
const SEVERITIES = new Set<DeveloperWorkspaceSeverity>(["P0", "P1", "P2"]);
const DISPOSITIONS = new Set<DeveloperWorkspaceDisposition>([
  "DEFECT",
  "MODEL_BEHAVIOR",
  "PRODUCT_GAP",
  "NOT_A_BUG",
  "UNCLEAR",
]);
const SOURCES = new Set<DeveloperWorkspaceSource>([
  "ASSISTANT_FEEDBACK",
  "FEEDBACK_TICKET",
]);

function single(raw: RawQuery, key: string, invalid: string[]): string | null {
  const value = raw[key];
  if (value === undefined || value === "") return null;
  if (Array.isArray(value)) {
    invalid.push(key);
    return null;
  }
  return value;
}

function opaque(value: string | null, max: number): string | null {
  return value && value.length <= max && /^[A-Za-z0-9._:-]+$/.test(value) ? value : null;
}

function cursor(value: string | null): string | null {
  return value && value.length <= 512 && /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

export function parseDeveloperWorkspaceQuery(raw: RawQuery): DeveloperWorkspaceQuery {
  const invalid: string[] = [];
  const rawView = single(raw, "view", invalid);
  const view = DEVELOPER_WORKSPACE_VIEWS.includes(rawView as DeveloperWorkspaceView)
    ? (rawView as DeveloperWorkspaceView)
    : "inbox";
  if (rawView && view === "inbox" && rawView !== "inbox") invalid.push("view");

  const rawTenantId = single(raw, "tenantId", invalid);
  const tenantId = opaque(rawTenantId, 160);
  if (rawTenantId && !tenantId) invalid.push("tenantId");

  const rawSearch = single(raw, "q", invalid);
  const normalizedSearch = rawSearch?.trim() ?? "";
  const q = normalizedSearch.length <= 120 ? normalizedSearch : "";
  if (rawSearch && !q) invalid.push("q");

  const rawSeverity = single(raw, "severity", invalid);
  const severity = SEVERITIES.has(rawSeverity as DeveloperWorkspaceSeverity)
    ? (rawSeverity as DeveloperWorkspaceSeverity)
    : null;
  if (rawSeverity && !severity) invalid.push("severity");

  const rawDisposition = single(raw, "disposition", invalid);
  const disposition = DISPOSITIONS.has(rawDisposition as DeveloperWorkspaceDisposition)
    ? (rawDisposition as DeveloperWorkspaceDisposition)
    : null;
  if (rawDisposition && !disposition) invalid.push("disposition");

  const rawSource = single(raw, "source", invalid);
  const parsedSource = SOURCES.has(rawSource as DeveloperWorkspaceSource)
    ? (rawSource as DeveloperWorkspaceSource)
    : null;
  if (rawSource && !parsedSource) invalid.push("source");
  const rawItem = single(raw, "item", invalid);
  const parsedItem = opaque(rawItem, 191);
  if (rawItem && !parsedItem) invalid.push("item");

  const rawAssistantCursor = single(raw, "assistantCursor", invalid);
  const parsedAssistantCursor = cursor(rawAssistantCursor);
  if (rawAssistantCursor && !parsedAssistantCursor) invalid.push("assistantCursor");
  const rawTicketCursor = single(raw, "ticketCursor", invalid);
  const parsedTicketCursor = cursor(rawTicketCursor);
  if (rawTicketCursor && !parsedTicketCursor) invalid.push("ticketCursor");

  const hasDeepLink = Boolean(tenantId && parsedSource && parsedItem);
  if ((rawSource || rawItem) && !hasDeepLink) invalid.push("deepLink");

  return {
    view,
    queue: view === "automation" ? "INBOX" : VIEW_TO_QUEUE[view],
    tenantId,
    q,
    severity,
    disposition,
    source: hasDeepLink ? parsedSource : null,
    item: hasDeepLink ? parsedItem : null,
    assistantCursor: tenantId ? parsedAssistantCursor : null,
    ticketCursor: tenantId ? parsedTicketCursor : null,
    invalid: [...new Set(invalid)],
  };
}

export function buildDeveloperWorkspaceHref(
  current: DeveloperWorkspaceQuery,
  patch: QueryPatch = {},
): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  params.set("view", next.view);
  if (next.tenantId) params.set("tenantId", next.tenantId);
  if (next.q) params.set("q", next.q);
  if (next.severity) params.set("severity", next.severity);
  if (next.disposition) params.set("disposition", next.disposition);
  if (next.source && next.item && next.tenantId) {
    params.set("source", next.source);
    params.set("item", next.item);
  }
  if (next.tenantId && next.assistantCursor) {
    params.set("assistantCursor", next.assistantCursor);
  }
  if (next.tenantId && next.ticketCursor) params.set("ticketCursor", next.ticketCursor);
  return `/developer?${params.toString()}`;
}
