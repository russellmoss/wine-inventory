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
import {
  closeFeedbackItemCore,
  updateFeedbackItemCore,
} from "@/lib/developer/feedback-item-actions";
import {
  approveAutomationRun,
  completeAutomationRun,
  ensurePlanAutomationRun,
  retryApprovedAutomationRun,
} from "@/lib/feedback/automation";
import { ensureOrganization, renameOrganization } from "./helpers/tenant-fixtures";

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
    // Atomic (ON CONFLICT DO NOTHING) rather than upsert: this file and tenant-isolation.test.ts
    // run in parallel vitest workers and both ensure `org_demo_winery`, so a plain upsert races
    // and dies with P2002. See test/helpers/tenant-fixtures.ts.
    await ensureOrganization(owner, {
      id: DEMO_TENANT,
      name: "Demo Winery",
      slug: "demo-winery",
    });
    await ensureOrganization(owner, {
      id: TENANT,
      name: "Developer Loader Vitest",
      slug: TENANT,
    });
    await renameOrganization(owner, TENANT, "Developer Loader Vitest");
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

  it("closes with a stamped outcome and rejects a stale concurrent close", async () => {
    const id = "developer_loader_close_outcome";
    await owner.feedbackTicket.create({
      data: {
        tenantId: TENANT,
        id,
        kind: "BUG_REPORT",
        title: "Close outcome concurrency",
        body: "A meaningful close must preserve history.",
        actorEmail: "loader@demowinery.test",
        modeAtSubmission: "REPORT_ONLY",
        status: "TRIAGED",
        triageClass: "DEFECT",
        developerNotes: "Existing investigation note",
      },
    });
    try {
      const original = await owner.feedbackTicket.findUniqueOrThrow({ where: { id } });
      await owner.feedbackTicket.update({
        where: { id },
        data: { developerNotes: "Concurrent developer note" },
      });
      await expect(
        closeFeedbackItemCore(
          { id: "developer-loader-vitest", email: "developer-loader@demowinery.test" },
          {
            tenantId: TENANT,
            sourceType: "FEEDBACK_TICKET",
            id,
            status: "RESOLVED",
            outcome: "Merged and verified the corrected close behavior.",
            expectedNotesVersion: original.developerNotesVersion,
          },
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const fresh = await owner.feedbackTicket.findUniqueOrThrow({ where: { id } });
      await closeFeedbackItemCore(
        { id: "developer-loader-vitest", email: "developer-loader@demowinery.test" },
        {
          tenantId: TENANT,
          sourceType: "FEEDBACK_TICKET",
          id,
          status: "RESOLVED",
          outcome: "Merged and verified the corrected close behavior.",
          expectedNotesVersion: fresh.developerNotesVersion,
        },
      );
      const closed = await owner.feedbackTicket.findUniqueOrThrow({ where: { id } });
      expect(closed.status).toBe("RESOLVED");
      expect(closed.resolvedAt).not.toBeNull();
      expect(closed.resolvedByUserId).toBe("developer-loader-vitest");
      expect(closed.developerNotes).toContain("[developer");
      expect(closed.developerNotes).toContain("Merged and verified");
      expect(closed.developerNotes).toContain("Concurrent developer note");
      await expect(
        updateFeedbackItemCore(
          { id: "developer-loader-vitest", email: "developer-loader@demowinery.test" },
          {
            tenantId: TENANT,
            sourceType: "FEEDBACK_TICKET",
            id,
            severity: "P1",
            triageClass: "DEFECT",
            status: "TRIAGED",
            expectedNotesVersion: fresh.developerNotesVersion,
          },
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await owner.feedbackTicket.findUniqueOrThrow({ where: { id } })).status).toBe(
        "RESOLVED",
      );
    } finally {
      await owner.feedbackTicket.deleteMany({ where: { tenantId: TENANT, id } });
    }
  });

  it("skips pending automation on close and rejects approval for a closed source", async () => {
    const id = "developer_loader_close_automation";
    await owner.feedbackTicket.create({
      data: {
        tenantId: TENANT,
        id,
        kind: "BUG_REPORT",
        title: "Close pending automation",
        body: "Closing must prevent later dispatch.",
        actorEmail: "loader@demowinery.test",
        modeAtSubmission: "PLAN_MODE",
        status: "TRIAGED",
        triageClass: "DEFECT",
        automationStatus: "AWAITING_APPROVAL",
      },
    });
    try {
      const ticket = await owner.feedbackTicket.findUniqueOrThrow({ where: { id } });
      const pending = await owner.automationRun.create({
        data: {
          tenantId: TENANT,
          sourceType: "FEEDBACK_TICKET",
          sourceId: id,
          ticketId: id,
          kind: "PLAN",
          status: "AWAITING_APPROVAL",
          idempotencyKey: `${TENANT}:${id}:pending`,
        },
      });
      await closeFeedbackItemCore(
        { id: "developer-loader-vitest", email: "developer-loader@demowinery.test" },
        {
          tenantId: TENANT,
          sourceType: "FEEDBACK_TICKET",
          id,
          status: "DISMISSED",
          outcome: "Closed after review before any automation was dispatched.",
          expectedNotesVersion: ticket.developerNotesVersion,
        },
      );
      expect((await owner.automationRun.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe(
        "SKIPPED",
      );

      const legacyAwaiting = await owner.automationRun.create({
        data: {
          tenantId: TENANT,
          sourceType: "FEEDBACK_TICKET",
          sourceId: id,
          ticketId: id,
          kind: "AGENTIC_FIX",
          status: "AWAITING_APPROVAL",
          idempotencyKey: `${TENANT}:${id}:closed-parent`,
        },
      });
      await expect(
        approveAutomationRun({
          tenantId: TENANT,
          runId: legacyAwaiting.id,
          approverUserId: "developer-loader-vitest",
        }),
      ).resolves.toBeNull();
    } finally {
      await owner.feedbackTicket.deleteMany({ where: { tenantId: TENANT, id } });
    }
  });

  it("rolls approval back with its audit and rejects stale route retries", async () => {
    const id = "developer_loader_automation_atomicity";
    await owner.feedbackTicket.create({
      data: {
        tenantId: TENANT,
        id,
        kind: "BUG_REPORT",
        title: "Automation transaction atomicity",
        body: "Approval and audit must commit together.",
        actorEmail: "loader@demowinery.test",
        modeAtSubmission: "AGENTIC_FIX",
        status: "TRIAGED",
        triageClass: "DEFECT",
        automationStatus: "AWAITING_APPROVAL",
      },
    });
    try {
      const awaiting = await owner.automationRun.create({
        data: {
          tenantId: TENANT,
          sourceType: "FEEDBACK_TICKET",
          sourceId: id,
          ticketId: id,
          kind: "AGENTIC_FIX",
          status: "AWAITING_APPROVAL",
          idempotencyKey: `${TENANT}:${id}:audit-rollback`,
          createdAt: new Date("2026-07-14T12:00:00.000Z"),
        },
      });
      await expect(
        approveAutomationRun({
          tenantId: TENANT,
          runId: awaiting.id,
          approverUserId: "developer-loader-vitest",
          onApproved: async () => {
            throw new Error("injected audit failure");
          },
        }),
      ).rejects.toThrow("injected audit failure");
      expect((await owner.automationRun.findUniqueOrThrow({ where: { id: awaiting.id } })).status).toBe(
        "AWAITING_APPROVAL",
      );

      await owner.feedbackTicket.update({
        where: { id },
        data: { triageClass: "PRODUCT_GAP", automationStatus: "PLANNED" },
      });
      await owner.automationRun.update({
        where: { id: awaiting.id },
        data: {
          status: "FAILED",
          approvedByUserId: "developer-loader-vitest",
          approvedAt: new Date(),
          error: "GitHub dispatch failed: 503",
        },
      });
      await owner.automationRun.create({
        data: {
          tenantId: TENANT,
          sourceType: "FEEDBACK_TICKET",
          sourceId: id,
          ticketId: id,
          kind: "PLAN",
          status: "PLANNED",
          idempotencyKey: `${TENANT}:${id}:newer-plan`,
          createdAt: new Date("2026-07-14T12:01:00.000Z"),
        },
      });
      await expect(
        retryApprovedAutomationRun({ tenantId: TENANT, runId: awaiting.id }),
      ).resolves.toBeNull();
      expect((await owner.automationRun.findUniqueOrThrow({ where: { id: awaiting.id } })).status).toBe(
        "FAILED",
      );
    } finally {
      await owner.feedbackTicket.deleteMany({ where: { tenantId: TENANT, id } });
    }
  });

  it("converges concurrent safe dispatch retries", async () => {
    const id = "developer_loader_concurrent_retry";
    await owner.feedbackTicket.create({
      data: {
        tenantId: TENANT,
        id,
        kind: "BUG_REPORT",
        title: "Concurrent dispatch retry",
        body: "Only one retry may requeue the run.",
        actorEmail: "loader@demowinery.test",
        modeAtSubmission: "AGENTIC_FIX",
        status: "TRIAGED",
        triageClass: "DEFECT",
        automationStatus: "FAILED",
      },
    });
    try {
      const run = await owner.automationRun.create({
        data: {
          tenantId: TENANT,
          sourceType: "FEEDBACK_TICKET",
          sourceId: id,
          ticketId: id,
          kind: "AGENTIC_FIX",
          status: "FAILED",
          approvedByUserId: "developer-loader-vitest",
          approvedAt: new Date(),
          error: "GitHub dispatch failed: 503",
          idempotencyKey: `${TENANT}:${id}:concurrent-retry`,
        },
      });
      const results = await Promise.all([
        retryApprovedAutomationRun({ tenantId: TENANT, runId: run.id }),
        retryApprovedAutomationRun({ tenantId: TENANT, runId: run.id }),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await owner.automationRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(
        "QUEUED",
      );
    } finally {
      await owner.feedbackTicket.deleteMany({ where: { tenantId: TENANT, id } });
    }
  });

  it("converges plan routing against closure without a dangling approval", async () => {
    const id = "developer_loader_plan_close_race";
    await owner.feedbackTicket.create({
      data: {
        tenantId: TENANT,
        id,
        kind: "FEATURE_REQUEST",
        title: "Plan routing close race",
        body: "A closed source cannot retain a pending plan.",
        actorEmail: "loader@demowinery.test",
        modeAtSubmission: "PLAN_MODE",
        status: "TRIAGED",
        triageClass: "PRODUCT_GAP",
        automationStatus: "NOT_REQUESTED",
      },
    });
    try {
      const ticket = await owner.feedbackTicket.findUniqueOrThrow({ where: { id } });
      const [closeResult] = await Promise.allSettled([
        closeFeedbackItemCore(
          { id: "developer-loader-vitest", email: "developer-loader@demowinery.test" },
          {
            tenantId: TENANT,
            sourceType: "FEEDBACK_TICKET",
            id,
            status: "DISMISSED",
            outcome: "Closed while plan routing was evaluated concurrently.",
            expectedNotesVersion: ticket.developerNotesVersion,
          },
        ),
        ensurePlanAutomationRun({
          tenantId: TENANT,
          sourceType: "FEEDBACK_TICKET",
          sourceId: id,
        }),
      ]);
      expect(closeResult.status).toBe("fulfilled");
      expect((await owner.feedbackTicket.findUniqueOrThrow({ where: { id } })).status).toBe(
        "DISMISSED",
      );
      expect(
        await owner.automationRun.count({
          where: {
            tenantId: TENANT,
            sourceType: "FEEDBACK_TICKET",
            sourceId: id,
            status: { in: ["AWAITING_APPROVAL", "QUEUED", "RUNNING"] },
          },
        }),
      ).toBe(0);
      await expect(
        ensurePlanAutomationRun({
          tenantId: TENANT,
          sourceType: "FEEDBACK_TICKET",
          sourceId: id,
        }),
      ).resolves.toMatchObject({ ok: false, reason: "SOURCE_CLOSED" });
      const lateAcceptedRun = await owner.automationRun.create({
        data: {
          tenantId: TENANT,
          sourceType: "FEEDBACK_TICKET",
          sourceId: id,
          ticketId: id,
          kind: "AGENTIC_FIX",
          status: "FAILED",
          approvedByUserId: "developer-loader-vitest",
          approvedAt: new Date(),
          error: "GitHub dispatch outcome is unknown after a transport failure: timeout.",
          idempotencyKey: `${TENANT}:${id}:late-accepted`,
        },
      });
      await completeAutomationRun({
        tenantId: TENANT,
        runId: lateAcceptedRun.id,
        githubUrl: "https://github.com/example/wine-inventory/pull/67",
        githubNumber: 67,
      });
      const completedSource = await owner.feedbackTicket.findUniqueOrThrow({ where: { id } });
      expect(completedSource.status).toBe("DISMISSED");
      expect(completedSource.automationStatus).toBe("PR_OPENED");
      expect(completedSource.prUrl).toBe("https://github.com/example/wine-inventory/pull/67");
      expect(
        (await owner.automationRun.findUniqueOrThrow({ where: { id: lateAcceptedRun.id } })).status,
      ).toBe("PR_OPENED");
    } finally {
      await owner.feedbackTicket.deleteMany({ where: { tenantId: TENANT, id } });
    }
  });
});
