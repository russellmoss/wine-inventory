import "server-only";

import {
  FeedbackAutomationKind,
  FeedbackAutomationSource,
  FeedbackAutomationStatus,
  type FeedbackAutomationMode,
  type FeedbackSeverity,
  type FeedbackTriageClass,
  Prisma,
} from "@prisma/client";
import { ActionError } from "@/lib/action-error";
import { requireDeveloper } from "@/lib/dal";
import {
  decodeDeveloperFeedbackCursor,
  developerFeedbackCursorWhere,
  DeveloperFeedbackCursorError,
  type DeveloperFeedbackSourceType,
  mergeDeveloperFeedbackPage,
} from "@/lib/developer/feedback-pagination";
import {
  buildDeveloperQueueWhere,
  DEVELOPER_QUEUES,
  deriveDeveloperQueue,
  developerQueueDiagnostic,
  type DeveloperQueue,
} from "@/lib/developer/linear-links";
import {
  deriveAutomationConflict,
  type AutomationConflict,
  type DeveloperAutomationRun,
} from "@/lib/feedback/automation";
import { sanitizePlainText } from "@/lib/feedback/sanitize";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";

export const DEVELOPER_TENANT_PAGE_SIZE = 20;
export const DEVELOPER_ITEM_LIMIT_PER_TENANT = 8;
export const DEVELOPER_EXACT_PAGE_SIZE = 20;

const linearLinkSelection = {
  orderBy: { linkedAt: "desc" as const },
  take: 1,
  select: {
    id: true,
    linearIssueKey: true,
    linearIssueUrl: true,
    linkedAt: true,
    version: true,
  },
};

const assistantInclude = {
  attachments: { select: { id: true } },
  linearLinks: linearLinkSelection,
} satisfies Prisma.AssistantFeedbackInclude;

const ticketInclude = {
  attachments: { select: { id: true } },
  linearLinks: linearLinkSelection,
} satisfies Prisma.FeedbackTicketInclude;

type AssistantFeedbackRow = Prisma.AssistantFeedbackGetPayload<{ include: typeof assistantInclude }>;
type FeedbackTicketRow = Prisma.FeedbackTicketGetPayload<{ include: typeof ticketInclude }>;

export type DeveloperTenantSummary = {
  id: string;
  name: string;
  slug: string;
  modes: {
    assistantFeedbackMode: FeedbackAutomationMode;
    bugReportMode: FeedbackAutomationMode;
    featureRequestMode: FeedbackAutomationMode;
  };
};

export type DeveloperFeedbackLinearLink = {
  id: string;
  linearIssueKey: string;
  linearIssueUrl: string;
  linkedAt: string;
  version: number;
};

export type DeveloperFeedbackItem = {
  sourceType: DeveloperFeedbackSourceType;
  id: string;
  tenantId: string;
  tenantName: string;
  createdAt: string;
  title: string;
  body: string;
  kind: string;
  modeAtSubmission: string;
  automationStatus: string;
  status: string;
  severity: string | null;
  triageClass: string | null;
  githubIssueUrl: string | null;
  githubRunUrl: string | null;
  prUrl: string | null;
  planMarkdown: string | null;
  planTitle: string | null;
  planGeneratedAt: string | null;
  developerNotes: string | null;
  developerNotesVersion: number;
  resolvedAt: string | null;
  attachmentCount: number;
  attachmentIds: string[];
  linearLink: DeveloperFeedbackLinearLink | null;
  awaitingRunId: string | null;
  awaitingRunKind: FeedbackAutomationKind | null;
  activeRun: DeveloperAutomationRun | null;
  automationConflict: AutomationConflict | null;
  queue: DeveloperQueue;
  queueDiagnostic: string | null;
};

export type DeveloperFeedbackData = {
  tenants: DeveloperTenantSummary[];
  items: DeveloperFeedbackItem[];
  shownTenants: number;
  totalTenants: number;
  activeQueue: DeveloperQueue | null;
  loadedCount: number;
};

export type DeveloperTenantFeedbackPage = {
  items: DeveloperFeedbackItem[];
  nextAssistantCursor: string | null;
  nextTicketCursor: string | null;
  hasMore: boolean;
  queueCounts: Record<DeveloperQueue, number>;
};

type AutomationFields = Pick<
  DeveloperFeedbackItem,
  "awaitingRunId" | "awaitingRunKind" | "activeRun" | "automationConflict"
>;

function validOpaqueId(value: unknown, max = 191): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function validTenantId(value: unknown): value is string {
  return validOpaqueId(value, 160);
}

function sourceType(value: unknown): DeveloperFeedbackSourceType | null {
  return value === FeedbackAutomationSource.ASSISTANT_FEEDBACK ||
    value === FeedbackAutomationSource.FEEDBACK_TICKET
    ? value
    : null;
}

function linearLink(
  rows: Array<{
    id: string;
    linearIssueKey: string;
    linearIssueUrl: string;
    linkedAt: Date;
    version: number;
  }>,
): DeveloperFeedbackLinearLink | null {
  const link = rows[0];
  return link
    ? {
        id: link.id,
        linearIssueKey: link.linearIssueKey,
        linearIssueUrl: link.linearIssueUrl,
        linkedAt: link.linkedAt.toISOString(),
        version: link.version,
      }
    : null;
}

async function loadAutomationFields(input: {
  assistantIds: string[];
  ticketIds: string[];
}): Promise<(source: DeveloperFeedbackSourceType, id: string, triage: FeedbackTriageClass | null) => AutomationFields> {
  const sourcePredicates = [
    input.assistantIds.length
      ? {
          sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
          sourceId: { in: input.assistantIds },
        }
      : null,
    input.ticketIds.length
      ? {
          sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
          sourceId: { in: input.ticketIds },
        }
      : null,
  ].filter((predicate): predicate is NonNullable<typeof predicate> => predicate !== null);
  const runs = sourcePredicates.length
    ? await prisma.automationRun.findMany({
        where: {
          OR: sourcePredicates,
          status: {
            in: [
              FeedbackAutomationStatus.AWAITING_APPROVAL,
              FeedbackAutomationStatus.QUEUED,
              FeedbackAutomationStatus.RUNNING,
              FeedbackAutomationStatus.PR_OPENED,
            ],
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, sourceType: true, sourceId: true, kind: true, status: true },
      })
    : [];

  const awaiting = new Map<string, DeveloperAutomationRun>();
  const active = new Map<string, DeveloperAutomationRun>();
  const conflicts = new Map<string, DeveloperAutomationRun>();
  for (const run of runs) {
    const key = `${run.sourceType}:${run.sourceId}`;
    if (run.status === FeedbackAutomationStatus.AWAITING_APPROVAL && !awaiting.has(key)) {
      awaiting.set(key, run);
    }
    if (run.status !== FeedbackAutomationStatus.PR_OPENED && !active.has(key)) active.set(key, run);
    if (
      run.kind === FeedbackAutomationKind.AGENTIC_FIX &&
      run.status !== FeedbackAutomationStatus.AWAITING_APPROVAL &&
      !conflicts.has(key)
    ) {
      conflicts.set(key, run);
    }
  }

  return (source, id, triage) => {
    const key = `${source}:${id}`;
    const awaitingRun = awaiting.get(key) ?? null;
    return {
      awaitingRunId: awaitingRun?.id ?? null,
      awaitingRunKind: awaitingRun?.kind ?? null,
      activeRun: active.get(key) ?? null,
      automationConflict: deriveAutomationConflict(triage, conflicts.get(key) ?? null),
    };
  };
}

function finalizeItem(
  base: Omit<DeveloperFeedbackItem, "queue" | "queueDiagnostic">,
): DeveloperFeedbackItem {
  const queue = deriveDeveloperQueue(base);
  return { ...base, queue, queueDiagnostic: developerQueueDiagnostic(base) };
}

function mapAssistantFeedback(
  feedback: AssistantFeedbackRow,
  tenant: { id: string; name: string },
  automation: AutomationFields,
): DeveloperFeedbackItem {
  const link = linearLink(feedback.linearLinks);
  return finalizeItem({
    sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
    id: feedback.id,
    tenantId: tenant.id,
    tenantName: tenant.name,
    createdAt: feedback.createdAt.toISOString(),
    title: "Assistant thumbs-down",
    body: sanitizePlainText(feedback.comment ?? "", 1_000),
    kind: "Assistant",
    modeAtSubmission: feedback.modeAtSubmission,
    automationStatus: feedback.automationStatus,
    status: feedback.status,
    severity: feedback.severity,
    triageClass: feedback.triageClass,
    githubIssueUrl: feedback.githubIssueUrl,
    githubRunUrl: feedback.githubRunUrl,
    prUrl: feedback.prUrl,
    planMarkdown: feedback.planMarkdown ? sanitizePlainText(feedback.planMarkdown, 8_000) : null,
    planTitle: feedback.planTitle ? sanitizePlainText(feedback.planTitle, 240) : null,
    planGeneratedAt: feedback.planGeneratedAt?.toISOString() ?? null,
    developerNotes: feedback.developerNotes
      ? sanitizePlainText(feedback.developerNotes, 4_000)
      : null,
    developerNotesVersion: feedback.developerNotesVersion,
    resolvedAt: feedback.resolvedAt?.toISOString() ?? null,
    attachmentCount: feedback.attachments.length,
    attachmentIds: feedback.attachments.map((attachment) => attachment.id),
    linearLink: link,
    ...automation,
  });
}

function mapFeedbackTicket(
  ticket: FeedbackTicketRow,
  tenant: { id: string; name: string },
  automation: AutomationFields,
): DeveloperFeedbackItem {
  const link = linearLink(ticket.linearLinks);
  return finalizeItem({
    sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
    id: ticket.id,
    tenantId: tenant.id,
    tenantName: tenant.name,
    createdAt: ticket.createdAt.toISOString(),
    title: sanitizePlainText(ticket.title, 240),
    body: sanitizePlainText(ticket.body, 1_200),
    kind: ticket.kind,
    modeAtSubmission: ticket.modeAtSubmission,
    automationStatus: ticket.automationStatus,
    status: ticket.status,
    severity: ticket.severity,
    triageClass: ticket.triageClass,
    githubIssueUrl: ticket.githubIssueUrl,
    githubRunUrl: ticket.githubRunUrl,
    prUrl: ticket.prUrl,
    planMarkdown: ticket.planMarkdown ? sanitizePlainText(ticket.planMarkdown, 8_000) : null,
    planTitle: ticket.planTitle ? sanitizePlainText(ticket.planTitle, 240) : null,
    planGeneratedAt: ticket.planGeneratedAt?.toISOString() ?? null,
    developerNotes: ticket.developerNotes ? sanitizePlainText(ticket.developerNotes, 4_000) : null,
    developerNotesVersion: ticket.developerNotesVersion,
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    attachmentCount: ticket.attachments.length,
    attachmentIds: ticket.attachments.map((attachment) => attachment.id),
    linearLink: link,
    ...automation,
  });
}

function textWhereForAssistant(text?: string): Prisma.AssistantFeedbackWhereInput | undefined {
  const value = text?.trim();
  return value
    ? {
        OR: [
          { id: { contains: value, mode: "insensitive" } },
          { comment: { contains: value, mode: "insensitive" } },
        ],
      }
    : undefined;
}

function textWhereForTicket(text?: string): Prisma.FeedbackTicketWhereInput | undefined {
  const value = text?.trim();
  return value
    ? {
        OR: [
          { id: { contains: value, mode: "insensitive" } },
          { title: { contains: value, mode: "insensitive" } },
          { body: { contains: value, mode: "insensitive" } },
        ],
      }
    : undefined;
}

export async function getDeveloperFeedbackData(input: {
  tenantQuery?: string;
  text?: string;
  tenantOffset?: number;
  queue?: DeveloperQueue;
  severity?: FeedbackSeverity | null;
  triageClass?: FeedbackTriageClass | null;
  includeItems?: boolean;
} = {}): Promise<DeveloperFeedbackData> {
  // Preserve the pre-queue console until PR C supplies a queue explicitly. This keeps the staged
  // rollout from hiding Ready/Tracked/Closed work between the backend and UI pull requests.
  const queue = input.queue && DEVELOPER_QUEUES.includes(input.queue) ? input.queue : null;
  const tenantWhere = input.tenantQuery
    ? {
        OR: [
          { name: { contains: input.tenantQuery, mode: "insensitive" as const } },
          { slug: { contains: input.tenantQuery, mode: "insensitive" as const } },
          { id: { contains: input.tenantQuery, mode: "insensitive" as const } },
        ],
      }
    : undefined;
  const [totalTenants, tenants] = await Promise.all([
    prisma.organization.count({ where: tenantWhere }),
    prisma.organization.findMany({
      where: tenantWhere,
      orderBy: { name: "asc" },
      skip: input.tenantOffset ?? 0,
      take: DEVELOPER_TENANT_PAGE_SIZE,
      select: { id: true, name: true, slug: true },
    }),
  ]);

  const summaries: DeveloperTenantSummary[] = [];
  const items: DeveloperFeedbackItem[] = [];
  for (const tenant of tenants) {
    await runAsTenant(tenant.id, async () => {
      const settings = await prisma.appSettings.findFirst({
        select: { assistantFeedbackMode: true, bugReportMode: true, featureRequestMode: true },
      });
      summaries.push({
        ...tenant,
        modes: {
          assistantFeedbackMode: settings?.assistantFeedbackMode ?? "AGENTIC_FIX",
          bugReportMode: settings?.bugReportMode ?? "REPORT_ONLY",
          featureRequestMode: settings?.featureRequestMode ?? "REPORT_ONLY",
        },
      });

      if (input.includeItems === false) return;

      const [feedback, tickets] = await Promise.all([
        prisma.assistantFeedback.findMany({
          where: {
            AND: [
              { rating: "down" },
              ...(queue
                ? [
                    buildDeveloperQueueWhere("ASSISTANT_FEEDBACK", queue),
                  ]
                : []),
              ...(textWhereForAssistant(input.text) ? [textWhereForAssistant(input.text)!] : []),
              ...(input.severity ? [{ severity: input.severity }] : []),
              ...(input.triageClass ? [{ triageClass: input.triageClass }] : []),
            ],
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: DEVELOPER_ITEM_LIMIT_PER_TENANT,
          include: assistantInclude,
        }),
        prisma.feedbackTicket.findMany({
          where: {
            AND: [
              ...(queue
                ? [
                    buildDeveloperQueueWhere("FEEDBACK_TICKET", queue),
                  ]
                : []),
              ...(textWhereForTicket(input.text) ? [textWhereForTicket(input.text)!] : []),
              ...(input.severity ? [{ severity: input.severity }] : []),
              ...(input.triageClass ? [{ triageClass: input.triageClass }] : []),
            ],
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: DEVELOPER_ITEM_LIMIT_PER_TENANT,
          include: ticketInclude,
        }),
      ]);
      const automation = await loadAutomationFields({
        assistantIds: feedback.map((item) => item.id),
        ticketIds: tickets.map((item) => item.id),
      });
      items.push(
        ...feedback.map((item) =>
          mapAssistantFeedback(
            item,
            tenant,
            automation("ASSISTANT_FEEDBACK", item.id, item.triageClass),
          ),
        ),
        ...tickets.map((item) =>
          mapFeedbackTicket(
            item,
            tenant,
            automation("FEEDBACK_TICKET", item.id, item.triageClass),
          ),
        ),
      );
    });
  }

  items.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    if (a.id !== b.id) return a.id < b.id ? 1 : -1;
    return a.sourceType.localeCompare(b.sourceType);
  });
  return {
    tenants: summaries,
    items,
    shownTenants: tenants.length,
    totalTenants,
    activeQueue: queue,
    loadedCount: items.length,
  };
}

export async function getDeveloperFeedbackItem(input: {
  tenantId: string;
  sourceType: string;
  id: string;
}): Promise<DeveloperFeedbackItem | null> {
  await requireDeveloper();
  const parsedSource = sourceType(input.sourceType);
  if (!validTenantId(input.tenantId) || !validOpaqueId(input.id) || !parsedSource) return null;
  const tenant = await prisma.organization.findUnique({
    where: { id: input.tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) return null;

  return runAsTenant(tenant.id, async () => {
    if (parsedSource === FeedbackAutomationSource.ASSISTANT_FEEDBACK) {
      const row = await prisma.assistantFeedback.findFirst({
        where: { tenantId: tenant.id, id: input.id, rating: "down" },
        include: assistantInclude,
      });
      if (!row) return null;
      const automation = await loadAutomationFields({ assistantIds: [row.id], ticketIds: [] });
      return mapAssistantFeedback(
        row,
        tenant,
        automation("ASSISTANT_FEEDBACK", row.id, row.triageClass),
      );
    }
    const row = await prisma.feedbackTicket.findFirst({
      where: { tenantId: tenant.id, id: input.id },
      include: ticketInclude,
    });
    if (!row) return null;
    const automation = await loadAutomationFields({ assistantIds: [], ticketIds: [row.id] });
    return mapFeedbackTicket(
      row,
      tenant,
      automation("FEEDBACK_TICKET", row.id, row.triageClass),
    );
  });
}

export async function getDeveloperTenantFeedbackPage(input: {
  tenantId: string;
  queue: DeveloperQueue;
  assistantCursor?: string | null;
  ticketCursor?: string | null;
  pageSize?: number;
  text?: string;
  severity?: FeedbackSeverity | null;
  triageClass?: FeedbackTriageClass | null;
}): Promise<DeveloperTenantFeedbackPage> {
  await requireDeveloper();
  if (!validTenantId(input.tenantId) || !DEVELOPER_QUEUES.includes(input.queue)) {
    throw new ActionError("Invalid developer feedback page.", "VALIDATION");
  }
  const pageSize = input.pageSize ?? DEVELOPER_EXACT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new ActionError("Invalid developer feedback page size.", "VALIDATION");
  }
  let assistantCursor;
  let ticketCursor;
  try {
    assistantCursor = decodeDeveloperFeedbackCursor(input.assistantCursor);
    ticketCursor = decodeDeveloperFeedbackCursor(input.ticketCursor);
  } catch (error) {
    if (error instanceof DeveloperFeedbackCursorError) {
      throw new ActionError(error.message, "VALIDATION");
    }
    throw error;
  }
  const tenant = await prisma.organization.findUnique({
    where: { id: input.tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) throw new ActionError("Tenant not found.", "VALIDATION");

  return runAsTenant(tenant.id, async () => {
    const assistantQueueWhere = buildDeveloperQueueWhere("ASSISTANT_FEEDBACK", input.queue);
    const ticketQueueWhere = buildDeveloperQueueWhere("FEEDBACK_TICKET", input.queue);
    const [feedback, tickets, queueCountEntries] = await Promise.all([
      prisma.assistantFeedback.findMany({
        where: {
          AND: [
            { rating: "down" },
            assistantQueueWhere,
            developerFeedbackCursorWhere(assistantCursor),
            ...(textWhereForAssistant(input.text) ? [textWhereForAssistant(input.text)!] : []),
            ...(input.severity ? [{ severity: input.severity }] : []),
            ...(input.triageClass ? [{ triageClass: input.triageClass }] : []),
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize + 1,
        include: assistantInclude,
      }),
      prisma.feedbackTicket.findMany({
        where: {
          AND: [
            ticketQueueWhere,
            developerFeedbackCursorWhere(ticketCursor),
            ...(textWhereForTicket(input.text) ? [textWhereForTicket(input.text)!] : []),
            ...(input.severity ? [{ severity: input.severity }] : []),
            ...(input.triageClass ? [{ triageClass: input.triageClass }] : []),
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize + 1,
        include: ticketInclude,
      }),
      Promise.all(
        DEVELOPER_QUEUES.map(async (queue) => {
          const [assistantCount, ticketCount] = await Promise.all([
            prisma.assistantFeedback.count({
              where: {
                AND: [
                  { rating: "down" },
                  buildDeveloperQueueWhere("ASSISTANT_FEEDBACK", queue),
                ],
              },
            }),
            prisma.feedbackTicket.count({
              where: buildDeveloperQueueWhere("FEEDBACK_TICKET", queue),
            }),
          ]);
          return [queue, assistantCount + ticketCount] as const;
        }),
      ),
    ]);
    const automation = await loadAutomationFields({
      assistantIds: feedback.map((item) => item.id),
      ticketIds: tickets.map((item) => item.id),
    });
    const assistantItems = feedback.map((item) =>
      mapAssistantFeedback(
        item,
        tenant,
        automation("ASSISTANT_FEEDBACK", item.id, item.triageClass),
      ),
    );
    const ticketItems = tickets.map((item) =>
      mapFeedbackTicket(
        item,
        tenant,
        automation("FEEDBACK_TICKET", item.id, item.triageClass),
      ),
    );
    const merged = mergeDeveloperFeedbackPage({
      assistantRows: assistantItems,
      ticketRows: ticketItems,
      pageSize,
      assistantCursor: input.assistantCursor,
      ticketCursor: input.ticketCursor,
    });

    return {
      ...merged,
      queueCounts: Object.fromEntries(queueCountEntries) as Record<DeveloperQueue, number>,
    };
  });
}
