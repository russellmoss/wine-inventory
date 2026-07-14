import "server-only";
import {
  FeedbackAutomationKind,
  FeedbackAutomationStatus,
  FeedbackAutomationSource,
  type FeedbackAutomationMode,
  type FeedbackTriageClass,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { sanitizePlainText } from "@/lib/feedback/sanitize";
import {
  deriveAutomationConflict,
  type AutomationConflict,
  type DeveloperAutomationRun,
} from "@/lib/feedback/automation";

export const DEVELOPER_TENANT_PAGE_SIZE = 20;
export const DEVELOPER_ITEM_LIMIT_PER_TENANT = 8;

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

export type DeveloperFeedbackItem = {
  sourceType: "ASSISTANT_FEEDBACK" | "FEEDBACK_TICKET";
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
  triageClass: string | null; // Plan 059: goalie-assigned disposition (DEFECT | MODEL_BEHAVIOR | PRODUCT_GAP | NOT_A_BUG | UNCLEAR), null = untriaged
  githubIssueUrl: string | null;
  prUrl: string | null;
  planMarkdown: string | null;
  developerNotes: string | null;
  resolvedAt: string | null; // ISO; set when the item was closed to RESOLVED (by triage or a human)
  attachmentCount: number;
  awaitingRunId: string | null;
  awaitingRunKind: FeedbackAutomationKind | null;
  activeRun: DeveloperAutomationRun | null;
  automationConflict: AutomationConflict | null;
};

export type DeveloperFeedbackData = {
  tenants: DeveloperTenantSummary[];
  items: DeveloperFeedbackItem[];
  shownTenants: number;
  totalTenants: number;
};

export async function getDeveloperFeedbackData(input: {
  tenantQuery?: string;
  text?: string;
  tenantOffset?: number;
} = {}): Promise<DeveloperFeedbackData> {
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
  const q = input.text?.trim().toLowerCase();

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

      const [feedback, tickets] = await Promise.all([
        prisma.assistantFeedback.findMany({
          where: { rating: "down" },
          orderBy: { createdAt: "desc" },
          take: DEVELOPER_ITEM_LIMIT_PER_TENANT,
          include: { attachments: { select: { id: true } } },
        }),
        prisma.feedbackTicket.findMany({
          orderBy: { createdAt: "desc" },
          take: DEVELOPER_ITEM_LIMIT_PER_TENANT,
          include: { attachments: { select: { id: true } } },
        }),
      ]);
      const sourcePredicates = [
        feedback.length > 0
          ? {
              sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
              sourceId: { in: feedback.map((item) => item.id) },
            }
          : null,
        tickets.length > 0
          ? {
              sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
              sourceId: { in: tickets.map((item) => item.id) },
            }
          : null,
      ].filter((predicate): predicate is NonNullable<typeof predicate> => predicate !== null);
      const runs =
        sourcePredicates.length === 0
          ? []
          : await prisma.automationRun.findMany({
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
              select: {
                id: true,
                sourceType: true,
                sourceId: true,
                kind: true,
                status: true,
              },
            },
          );
      const awaitingRunBySource = new Map<string, DeveloperAutomationRun>();
      const activeRunBySource = new Map<string, DeveloperAutomationRun>();
      const conflictRunBySource = new Map<string, DeveloperAutomationRun>();
      for (const run of runs) {
        const key = `${run.sourceType}:${run.sourceId}`;
        if (run.status === FeedbackAutomationStatus.AWAITING_APPROVAL && !awaitingRunBySource.has(key)) {
          awaitingRunBySource.set(key, run);
        }
        if (run.status !== FeedbackAutomationStatus.PR_OPENED && !activeRunBySource.has(key)) {
          activeRunBySource.set(key, run);
        }
        if (
          run.kind === FeedbackAutomationKind.AGENTIC_FIX &&
          run.status !== FeedbackAutomationStatus.AWAITING_APPROVAL &&
          !conflictRunBySource.has(key)
        ) {
          conflictRunBySource.set(key, run);
        }
      }
      const automationFields = (
        sourceType: FeedbackAutomationSource,
        sourceId: string,
        triageClass: FeedbackTriageClass | null,
      ) => {
        const key = `${sourceType}:${sourceId}`;
        const awaitingRun = awaitingRunBySource.get(key) ?? null;
        return {
          awaitingRunId: awaitingRun?.id ?? null,
          awaitingRunKind: awaitingRun?.kind ?? null,
          activeRun: activeRunBySource.get(key) ?? null,
          automationConflict: deriveAutomationConflict(
            triageClass,
            conflictRunBySource.get(key) ?? null,
          ),
        };
      };

      for (const fb of feedback) {
        const body = fb.comment ?? "";
        if (q && !`${fb.id} ${body}`.toLowerCase().includes(q)) continue;
        items.push({
          sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
          id: fb.id,
          tenantId: tenant.id,
          tenantName: tenant.name,
          createdAt: fb.createdAt.toISOString(),
          title: "Assistant thumbs-down",
          body: sanitizePlainText(body, 1000),
          kind: "Assistant",
          modeAtSubmission: fb.modeAtSubmission,
          automationStatus: fb.automationStatus,
          status: fb.status,
          severity: fb.severity,
          triageClass: fb.triageClass,
          githubIssueUrl: fb.githubIssueUrl,
          prUrl: fb.prUrl,
          planMarkdown: fb.planMarkdown ? sanitizePlainText(fb.planMarkdown, 8000) : null,
          developerNotes: fb.developerNotes ? sanitizePlainText(fb.developerNotes, 4000) : null,
          resolvedAt: fb.resolvedAt ? fb.resolvedAt.toISOString() : null,
          attachmentCount: fb.attachments.length,
          ...automationFields(FeedbackAutomationSource.ASSISTANT_FEEDBACK, fb.id, fb.triageClass),
        });
      }

      for (const ticket of tickets) {
        if (q && !`${ticket.id} ${ticket.title} ${ticket.body}`.toLowerCase().includes(q)) continue;
        items.push({
          sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
          id: ticket.id,
          tenantId: tenant.id,
          tenantName: tenant.name,
          createdAt: ticket.createdAt.toISOString(),
          title: sanitizePlainText(ticket.title, 240),
          body: sanitizePlainText(ticket.body, 1200),
          kind: ticket.kind,
          modeAtSubmission: ticket.modeAtSubmission,
          automationStatus: ticket.automationStatus,
          status: ticket.status,
          severity: ticket.severity,
          triageClass: ticket.triageClass,
          githubIssueUrl: ticket.githubIssueUrl,
          prUrl: ticket.prUrl,
          planMarkdown: ticket.planMarkdown ? sanitizePlainText(ticket.planMarkdown, 8000) : null,
          developerNotes: ticket.developerNotes ? sanitizePlainText(ticket.developerNotes, 4000) : null,
          resolvedAt: ticket.resolvedAt ? ticket.resolvedAt.toISOString() : null,
          attachmentCount: ticket.attachments.length,
          ...automationFields(FeedbackAutomationSource.FEEDBACK_TICKET, ticket.id, ticket.triageClass),
        });
      }
    });
  }

  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { tenants: summaries, items, shownTenants: tenants.length, totalTenants };
}
