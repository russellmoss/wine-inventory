import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

vi.mock("@/lib/dal", () => ({
  requireDeveloper: vi.fn(async () => ({
    id: "developer-loader-vitest",
    email: "developer-loader@demowinery.test",
  })),
}));

import {
  getDeveloperFeedbackItem,
  getDeveloperTenantFeedbackPage,
} from "@/lib/developer/feedback";
import { linkFeedbackToLinearCore } from "@/lib/developer/linear-link-actions";
import { updateFeedbackItemCore } from "@/lib/developer/feedback-item-actions";

const ENABLED =
  process.env.TENANT_ISOLATION_DB === "1" &&
  Boolean(process.env.DATABASE_URL_UNPOOLED);
const TENANT = "org_developer_loader_vitest";
const DEMO_TENANT = "org_demo_winery";
const OLD_ID = "developer_loader_old_ticket";
const CONFLICT_ID = "developer_loader_product_gap_conflict";
const READY_ASSISTANT_IDS = Array.from(
  { length: 3 },
  (_, index) => `developer_loader_ready_assistant_${index}`,
);
const READY_TICKET_IDS = Array.from(
  { length: 3 },
  (_, index) => `developer_loader_ready_ticket_${index}`,
);
const TRACKED_IDS = Array.from(
  { length: 10 },
  (_, index) => `developer_loader_tracked_ticket_${index}`,
);

describe.skipIf(!ENABLED)("developer feedback database loaders", () => {
  let owner: PrismaClient;

  beforeAll(async () => {
    owner = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL_UNPOOLED } },
    });
    await owner.organization.upsert({
      where: { id: DEMO_TENANT },
      update: {},
      create: { id: DEMO_TENANT, name: "Demo Winery", slug: "demo-winery" },
    });
    await owner.organization.upsert({
      where: { id: TENANT },
      update: { name: "Developer Loader Vitest" },
      create: { id: TENANT, name: "Developer Loader Vitest", slug: TENANT },
    });
    await owner.auditLog.deleteMany({ where: { tenantId: TENANT } });
    await owner.feedbackTicket.deleteMany({ where: { tenantId: TENANT } });
    await owner.assistantFeedback.deleteMany({ where: { tenantId: TENANT } });

    await owner.feedbackTicket.create({
      data: {
        tenantId: TENANT,
        id: OLD_ID,
        kind: "FEATURE_REQUEST",
        title: "Old exact target",
        body: "Must remain addressable beyond bounded recent lists.",
        actorEmail: "loader@demowinery.test",
        modeAtSubmission: "REPORT_ONLY",
        status: "TRIAGED",
        triageClass: "DEFECT",
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });
    await owner.feedbackTicket.create({
      data: {
        tenantId: TENANT,
        id: CONFLICT_ID,
        kind: "FEATURE_REQUEST",
        title: "Product gap with active fix",
        body: "Must be routed into Inbox by the relational conflict predicate.",
        actorEmail: "loader@demowinery.test",
        modeAtSubmission: "REPORT_ONLY",
        automationStatus: "RUNNING",
        status: "TRIAGED",
        triageClass: "PRODUCT_GAP",
        createdAt: new Date("2020-01-02T00:00:00.000Z"),
      },
    });
    await owner.automationRun.create({
      data: {
        tenantId: TENANT,
        id: "developer_loader_active_fix_run",
        sourceType: "FEEDBACK_TICKET",
        sourceId: CONFLICT_ID,
        ticketId: CONFLICT_ID,
        kind: "AGENTIC_FIX",
        status: "RUNNING",
        idempotencyKey: `${TENANT}:FEEDBACK_TICKET:${CONFLICT_ID}:AGENTIC_FIX:1`,
      },
    });
    for (let index = 0; index < READY_ASSISTANT_IDS.length; index++) {
      await owner.assistantFeedback.create({
        data: {
          tenantId: TENANT,
          id: READY_ASSISTANT_IDS[index],
          rating: "down",
          comment: `Ready assistant ${index}`,
          conversation: [],
          actorEmail: "loader@demowinery.test",
          modeAtSubmission: "REPORT_ONLY",
          status: "TRIAGED",
          triageClass: "DEFECT",
          createdAt: new Date(Date.UTC(2026, 6, 14, 15, index * 2)),
        },
      });
      await owner.feedbackTicket.create({
        data: {
          tenantId: TENANT,
          id: READY_TICKET_IDS[index],
          kind: "BUG_REPORT",
          title: `Ready ticket ${index}`,
          body: "Ready loader fixture",
          actorEmail: "loader@demowinery.test",
          modeAtSubmission: "REPORT_ONLY",
          status: "TRIAGED",
          triageClass: "DEFECT",
          createdAt: new Date(Date.UTC(2026, 6, 14, 15, index * 2 + 1)),
        },
      });
    }
    for (let index = 0; index < TRACKED_IDS.length; index++) {
      await owner.feedbackTicket.create({
        data: {
          tenantId: TENANT,
          id: TRACKED_IDS[index],
          kind: "FEATURE_REQUEST",
          title: `Newer tracked ticket ${index}`,
          body: "Must not crowd Ready rows out before take().",
          actorEmail: "loader@demowinery.test",
          modeAtSubmission: "REPORT_ONLY",
          status: "TRIAGED",
          triageClass: "PRODUCT_GAP",
          prUrl: `https://github.com/acme/wine/pull/${index + 1}`,
          createdAt: new Date(Date.UTC(2026, 6, 15, 15, index)),
        },
      });
    }
  });

  afterAll(async () => {
    if (!owner) return;
    await owner.auditLog.deleteMany({ where: { tenantId: TENANT } });
    await owner.feedbackTicket.deleteMany({ where: { tenantId: TENANT } });
    await owner.assistantFeedback.deleteMany({ where: { tenantId: TENANT } });
    await owner.organization.deleteMany({ where: { id: TENANT } });
    await owner.$disconnect();
  });

  it("loads an exact old item and returns null across a tenant boundary", async () => {
    const exact = await getDeveloperFeedbackItem({
      tenantId: TENANT,
      sourceType: "FEEDBACK_TICKET",
      id: OLD_ID,
    });
    expect(exact?.id).toBe(OLD_ID);
    expect(
      await getDeveloperFeedbackItem({
        tenantId: DEMO_TENANT,
        sourceType: "FEEDBACK_TICKET",
        id: OLD_ID,
      }),
    ).toBeNull();
  });

  it("filters by queue before take and reports exact tenant counts", async () => {
    const page = await getDeveloperTenantFeedbackPage({
      tenantId: TENANT,
      queue: "READY",
      pageSize: 2,
    });
    expect(page.items).toHaveLength(2);
    expect(page.items.every((item) => item.queue === "READY")).toBe(true);
    expect(page.queueCounts).toEqual({ INBOX: 1, READY: 7, TRACKED: 10, CLOSED: 0 });
  });

  it("uses the real automation parent relation to route fix conflicts into Inbox", async () => {
    const page = await getDeveloperTenantFeedbackPage({
      tenantId: TENANT,
      queue: "INBOX",
      pageSize: 50,
    });
    const conflict = page.items.find((item) => item.id === CONFLICT_ID);
    expect(conflict?.queue).toBe("INBOX");
    expect(conflict?.automationConflict?.code).toBe("PRODUCT_GAP_WITH_ACTIVE_FIX");
  });

  it("traverses the merged dual-cursor feed without duplicates or omissions", async () => {
    const seen: string[] = [];
    let assistantCursor: string | null = null;
    let ticketCursor: string | null = null;
    for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
      const page = await getDeveloperTenantFeedbackPage({
        tenantId: TENANT,
        queue: "READY",
        pageSize: 2,
        assistantCursor,
        ticketCursor,
      });
      seen.push(...page.items.map((item) => `${item.sourceType}:${item.id}`));
      assistantCursor = page.nextAssistantCursor;
      ticketCursor = page.nextTicketCursor;
      if (!page.hasMore) break;
    }
    const expected = [
      `FEEDBACK_TICKET:${OLD_ID}`,
      ...READY_ASSISTANT_IDS.map((id) => `ASSISTANT_FEEDBACK:${id}`),
      ...READY_TICKET_IDS.map((id) => `FEEDBACK_TICKET:${id}`),
    ];
    expect(new Set(seen)).toEqual(new Set(expected));
    expect(seen).toHaveLength(expected.length);
  });

  it("rejects a stale notes revision after a Linear handoff appends history", async () => {
    const id = "developer_loader_stale_notes";
    await owner.feedbackTicket.create({
      data: {
        tenantId: TENANT,
        id,
        kind: "FEATURE_REQUEST",
        title: "Stale notes editor",
        body: "Concurrency fixture",
        actorEmail: "loader@demowinery.test",
        modeAtSubmission: "REPORT_ONLY",
        status: "TRIAGED",
        triageClass: "PRODUCT_GAP",
      },
    });
    try {
      const stale = await owner.feedbackTicket.findUniqueOrThrow({ where: { id } });
      await linkFeedbackToLinearCore(
        { id: "developer-loader-vitest", email: "developer-loader@demowinery.test" },
        {
          tenantId: TENANT,
          sourceType: "FEEDBACK_TICKET",
          id,
          linearIssueKey: "WIN-98001",
          normalizedUrl: "https://linear.app/wine-inventory/issue/WIN-98001",
          replace: false,
          confirmFanIn: false,
        },
      );
      const postLink = await owner.feedbackTicket.findUniqueOrThrow({ where: { id } });
      expect(postLink.developerNotesVersion).toBe(stale.developerNotesVersion + 1);
      await owner.feedbackTicket.update({
        where: { id },
        data: { developerNotes: "legacy writer without a version increment" },
      });
      const postLegacy = await owner.feedbackTicket.findUniqueOrThrow({ where: { id } });
      expect(postLegacy.developerNotesVersion).toBe(postLink.developerNotesVersion + 1);
      await expect(
        updateFeedbackItemCore(
          { id: "developer-loader-vitest", email: "developer-loader@demowinery.test" },
          {
            tenantId: TENANT,
            sourceType: "FEEDBACK_TICKET",
            id,
            severity: null,
            triageClass: "PRODUCT_GAP",
            status: "TRIAGED",
            developerNotes: "stale overwrite",
            expectedNotesVersion: postLink.developerNotesVersion,
          },
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const current = await owner.feedbackTicket.findUniqueOrThrow({ where: { id } });
      expect(current.developerNotes).toContain("Promoted to Linear WIN-98001");
      expect(current.developerNotes).toContain("legacy writer without a version increment");
    } finally {
      await owner.feedbackTicket.deleteMany({ where: { tenantId: TENANT, id } });
    }
  });
});
