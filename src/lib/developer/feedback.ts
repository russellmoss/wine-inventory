import "server-only";
import {
  FeedbackAutomationStatus,
  FeedbackAutomationSource,
  type FeedbackAutomationMode,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { sanitizePlainText } from "@/lib/feedback/sanitize";

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
  githubIssueUrl: string | null;
  prUrl: string | null;
  planMarkdown: string | null;
  developerNotes: string | null;
  attachmentCount: number;
  awaitingRunId: string | null;
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

      const [feedback, tickets, runs] = await Promise.all([
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
        prisma.automationRun.findMany({
          where: { status: FeedbackAutomationStatus.AWAITING_APPROVAL },
          select: { id: true, sourceType: true, sourceId: true },
        }),
      ]);
      const runBySource = new Map(runs.map((r) => [`${r.sourceType}:${r.sourceId}`, r.id]));

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
          githubIssueUrl: fb.githubIssueUrl,
          prUrl: fb.prUrl,
          planMarkdown: fb.planMarkdown ? sanitizePlainText(fb.planMarkdown, 8000) : null,
          developerNotes: fb.developerNotes ? sanitizePlainText(fb.developerNotes, 4000) : null,
          attachmentCount: fb.attachments.length,
          awaitingRunId: runBySource.get(`${FeedbackAutomationSource.ASSISTANT_FEEDBACK}:${fb.id}`) ?? null,
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
          githubIssueUrl: ticket.githubIssueUrl,
          prUrl: ticket.prUrl,
          planMarkdown: ticket.planMarkdown ? sanitizePlainText(ticket.planMarkdown, 8000) : null,
          developerNotes: ticket.developerNotes ? sanitizePlainText(ticket.developerNotes, 4000) : null,
          attachmentCount: ticket.attachments.length,
          awaitingRunId: runBySource.get(`${FeedbackAutomationSource.FEEDBACK_TICKET}:${ticket.id}`) ?? null,
        });
      }
    });
  }

  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { tenants: summaries, items, shownTenants: tenants.length, totalTenants };
}
