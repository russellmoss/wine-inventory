import { describe, expect, it } from "vitest";
import {
  DEVELOPER_QUEUES,
  buildDeveloperQueueWhere,
  buildFeedbackHandoffMarkdown,
  deriveDeveloperQueue,
  developerQueueDiagnostic,
  parseLinearIssueUrl,
  promotionEligibility,
  type DeveloperFeedbackSource,
  type DeveloperQueueItem,
  type FeedbackHandoffItem,
} from "@/lib/developer/linear-links";
import { parseLinkFeedbackToLinearInput } from "@/lib/developer/linear-link-input";

type QueueFixture = DeveloperQueueItem & {
  linearLinks: Array<{ linearIssueUrl: string }>;
  automationRuns: Array<{ kind: string; status: string }>;
  severity?: string | null;
};

function matchesScalar(actual: unknown, condition: unknown): boolean {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
    return actual === condition;
  }
  const filter = condition as Record<string, unknown>;
  if ("in" in filter && !(filter.in as unknown[]).includes(actual)) return false;
  if ("notIn" in filter && (filter.notIn as unknown[]).includes(actual)) return false;
  if ("not" in filter && actual === filter.not) return false;
  if ("some" in filter) {
    return (
      Array.isArray(actual) &&
      actual.some((entry) =>
        matchesWhere(filter.some as Record<string, unknown>, entry as Record<string, unknown>),
      )
    );
  }
  return true;
}

function matchesWhere(where: Record<string, unknown>, item: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND") {
      return (condition as Record<string, unknown>[]).every((part) => matchesWhere(part, item));
    }
    if (key === "OR") {
      return (condition as Record<string, unknown>[]).some((part) => matchesWhere(part, item));
    }
    if (key === "NOT") return !matchesWhere(condition as Record<string, unknown>, item);
    return matchesScalar(item[key], condition);
  });
}

function matchingQueues(item: QueueFixture) {
  return DEVELOPER_QUEUES.filter((queue) =>
    matchesWhere(
      buildDeveloperQueueWhere(item.sourceType, queue) as Record<string, unknown>,
      item as unknown as Record<string, unknown>,
    ),
  );
}

function fixture(
  sourceType: DeveloperFeedbackSource,
  values: Partial<QueueFixture> = {},
): QueueFixture {
  return {
    sourceType,
    id: `${sourceType.toLowerCase()}_1`,
    status: "TRIAGED",
    automationStatus: "NOT_REQUESTED",
    triageClass: "DEFECT",
    linearLinks: [],
    automationRuns: [],
    prUrl: null,
    githubIssueUrl: null,
    automationConflict: null,
    ...values,
  };
}

describe("parseLinearIssueUrl", () => {
  it.each([
    [
      "https://linear.app/wine-inventory/issue/WIN-42/fix-cellar-sync",
      { linearIssueKey: "WIN-42", normalizedUrl: "https://linear.app/wine-inventory/issue/WIN-42/fix-cellar-sync" },
    ],
    [
      "  https://LINEAR.APP/wine_inventory/issue/win-7?utm_source=copy#comment-2  ",
      { linearIssueKey: "WIN-7", normalizedUrl: "https://linear.app/wine_inventory/issue/WIN-7" },
    ],
    [
      "https://linear.app/wine/issue/OPS9-100/",
      { linearIssueKey: "OPS9-100", normalizedUrl: "https://linear.app/wine/issue/OPS9-100" },
    ],
  ])("accepts and canonicalizes exact issue URLs", (value, expected) => {
    expect(parseLinearIssueUrl(value)).toEqual({ ok: true, ...expected });
  });

  it.each([
    ["", "EMPTY"],
    ["not a url", "INVALID_URL"],
    ["http://linear.app/wine/issue/WIN-1", "INVALID_PROTOCOL"],
    ["https://linear.app.evil.test/wine/issue/WIN-1", "INVALID_HOST"],
    ["https://issues.linear.app/wine/issue/WIN-1", "INVALID_HOST"],
    ["https://user:pass@linear.app/wine/issue/WIN-1", "CREDENTIALS_NOT_ALLOWED"],
    ["https://linear.app:443/wine/issue/WIN-1", "PORT_NOT_ALLOWED"],
    ["https://linear.app/wine/project/WIN-1", "INVALID_ISSUE_PATH"],
    ["https://linear.app/issue/WIN-1", "INVALID_ISSUE_PATH"],
    ["https://linear.app/wine/issue/not-a-key", "INVALID_ISSUE_PATH"],
    ["https://linear.app/wine/issue/WIN-1/title/extra", "INVALID_ISSUE_PATH"],
    ["https://linear.app/wine%2Fother/issue/WIN-1", "INVALID_ISSUE_PATH"],
    ["https:\\linear.app\\wine\\issue\\WIN-1", "INVALID_URL"],
  ])("rejects unsafe or non-issue input", (value, code) => {
    const result = parseLinearIssueUrl(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it("treats the issue key as a retained display snapshot across a simulated team move", () => {
    const oldLink = parseLinearIssueUrl("https://linear.app/wine/issue/WIN-42/original-title");
    const movedLink = parseLinearIssueUrl("https://linear.app/wine/issue/OPS-42/original-title");
    expect(oldLink.ok && oldLink.linearIssueKey).toBe("WIN-42");
    expect(movedLink.ok && movedLink.linearIssueKey).toBe("OPS-42");
  });
});

describe("parseLinkFeedbackToLinearInput", () => {
  it("normalizes optional action flags after validating the object shape", () => {
    expect(
      parseLinkFeedbackToLinearInput({
        tenantId: "org_demo_winery",
        sourceType: "FEEDBACK_TICKET",
        id: "ticket_42",
        linearUrl: "https://linear.app/wine/issue/WIN-42",
      }),
    ).toEqual({
      tenantId: "org_demo_winery",
      sourceType: "FEEDBACK_TICKET",
      id: "ticket_42",
      linearUrl: "https://linear.app/wine/issue/WIN-42",
      expectedVersion: undefined,
      replace: false,
      confirmFanIn: false,
    });
  });

  it.each([
    null,
    undefined,
    42,
    "payload",
    [],
    { tenantId: "org_demo_winery", sourceType: "FEEDBACK_TICKET", id: 42, linearUrl: "https://linear.app/wine/issue/WIN-42" },
    { tenantId: "org_demo_winery", sourceType: "FEEDBACK_TICKET", id: "ticket_42", linearUrl: "https://linear.app/wine/issue/WIN-42", expectedVersion: 0 },
    { tenantId: "org_demo_winery", sourceType: "FEEDBACK_TICKET", id: "ticket_42", linearUrl: "https://linear.app/wine/issue/WIN-42", replace: "yes" },
  ])("rejects malformed or primitive Server Action payloads", (value) => {
    expect(() => parseLinkFeedbackToLinearInput(value)).toThrow();
  });
});

describe("developer queue derivation and Prisma where parity", () => {
  const fixtures: QueueFixture[] = [
    fixture("ASSISTANT_FEEDBACK", {
      id: "assistant_closed",
      status: "RESOLVED",
      automationStatus: "FAILED",
      linearLinks: [{ linearIssueUrl: "https://linear.app/wine/issue/WIN-1" }],
    }),
    fixture("ASSISTANT_FEEDBACK", {
      id: "assistant_inbox",
      status: "NEW",
      triageClass: null,
    }),
    fixture("ASSISTANT_FEEDBACK", {
      id: "assistant_ready",
      status: "TRIAGED",
      triageClass: "DEFECT",
    }),
    fixture("ASSISTANT_FEEDBACK", {
      id: "assistant_tracked",
      status: "TRIAGED",
      triageClass: "PRODUCT_GAP",
      automationStatus: "PLANNED",
    }),
    fixture("FEEDBACK_TICKET", {
      id: "ticket_closed",
      status: "DISMISSED",
      triageClass: "NOT_A_BUG",
    }),
    fixture("FEEDBACK_TICKET", {
      id: "ticket_inbox",
      status: "IN_PROGRESS",
      automationStatus: "FAILED",
      linearLinks: [{ linearIssueUrl: "https://linear.app/wine/issue/WIN-2" }],
    }),
    fixture("FEEDBACK_TICKET", {
      id: "ticket_ready",
      status: "IN_PROGRESS",
      automationStatus: "AWAITING_APPROVAL",
      triageClass: "MODEL_BEHAVIOR",
      severity: "P0",
    }),
    fixture("FEEDBACK_TICKET", {
      id: "ticket_tracked",
      status: "NEW",
      triageClass: null,
      githubIssueUrl: "https://github.com/acme/wine/issues/10",
    }),
    fixture("FEEDBACK_TICKET", {
      id: "ticket_empty_artifact_urls",
      status: "TRIAGED",
      triageClass: "DEFECT",
      prUrl: "",
      githubIssueUrl: "",
    }),
  ];

  it.each(fixtures)("assigns $sourceType/$id to exactly one matching query", (item) => {
    const derived = deriveDeveloperQueue(item);
    expect(matchingQueues(item)).toEqual([derived]);
  });

  it("applies CLOSED > failure/conflict > TRACKED > triage > READY precedence", () => {
    expect(deriveDeveloperQueue(fixtures[0])).toBe("CLOSED");
    expect(deriveDeveloperQueue(fixtures[5])).toBe("INBOX");
    expect(deriveDeveloperQueue(fixtures[7])).toBe("TRACKED");
    expect(deriveDeveloperQueue(fixtures[6])).toBe("READY");
    expect(deriveDeveloperQueue(fixtures[8])).toBe("READY");

    const conflict = fixture("FEEDBACK_TICKET", {
      id: "ticket_conflict",
      status: "TRIAGED",
      triageClass: "PRODUCT_GAP",
      automationStatus: "RUNNING",
      githubIssueUrl: "https://github.com/acme/wine/issues/11",
      automationConflict: { code: "PRODUCT_GAP_WITH_ACTIVE_FIX" },
      automationRuns: [{ kind: "AGENTIC_FIX", status: "RUNNING" }],
    });
    expect(deriveDeveloperQueue(conflict)).toBe("INBOX");
    expect(matchingQueues(conflict)).toEqual(["INBOX"]);

    const ordinaryFix = fixture("FEEDBACK_TICKET", {
      id: "ticket_ordinary_fix",
      triageClass: "DEFECT",
      automationStatus: "RUNNING",
      automationRuns: [{ kind: "AGENTIC_FIX", status: "RUNNING" }],
    });
    expect(deriveDeveloperQueue(ordinaryFix)).toBe("READY");
    expect(matchingQueues(ordinaryFix)).toEqual(["READY"]);

    const productPlan = fixture("FEEDBACK_TICKET", {
      id: "ticket_product_plan",
      triageClass: "PRODUCT_GAP",
      automationStatus: "RUNNING",
      automationRuns: [{ kind: "PLAN", status: "RUNNING" }],
    });
    expect(deriveDeveloperQueue(productPlan)).toBe("READY");
    expect(matchingQueues(productPlan)).toEqual(["READY"]);
  });

  it("fails an unknown legacy assistant status safely into Inbox with a diagnostic", () => {
    const item = fixture("ASSISTANT_FEEDBACK", {
      id: "assistant_legacy",
      status: "FIXED_BY_OLD_WORKER",
      automationStatus: "PLANNED",
      linearLinks: [{ linearIssueUrl: "https://linear.app/wine/issue/WIN-8" }],
    });
    expect(deriveDeveloperQueue(item)).toBe("INBOX");
    expect(matchingQueues(item)).toEqual(["INBOX"]);
    expect(developerQueueDiagnostic(item)).toContain("Unknown legacy AssistantFeedback status");
  });

  it("keeps P0 and awaiting approval as attention signals inside Ready, not separate queues", () => {
    const item = fixtures[6];
    expect(item.severity).toBe("P0");
    expect(item.automationStatus).toBe("AWAITING_APPROVAL");
    expect(deriveDeveloperQueue(item)).toBe("READY");
  });
});

describe("promotionEligibility", () => {
  it("allows actionable items even when generated work already exists", () => {
    const item = fixture("FEEDBACK_TICKET", {
      status: "NEW",
      triageClass: "PRODUCT_GAP",
      automationStatus: "PLANNED",
      githubIssueUrl: "https://github.com/acme/wine/issues/20",
    });
    expect(promotionEligibility(item)).toEqual({ allowed: true, reason: null });
  });

  it.each([
    [fixture("FEEDBACK_TICKET", { status: "RESOLVED" }), "Reopen"],
    [fixture("FEEDBACK_TICKET", { triageClass: null }), "Classify"],
    [fixture("FEEDBACK_TICKET", { triageClass: "NOT_A_BUG" }), "Not a bug"],
    [fixture("FEEDBACK_TICKET", { triageClass: "UNCLEAR" }), "Investigate"],
    [fixture("ASSISTANT_FEEDBACK", { status: "LEGACY_DONE" }), "Unknown legacy"],
  ])("blocks closed, unclassified, non-actionable, and unknown legacy items", (item, reason) => {
    const result = promotionEligibility(item);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain(reason);
  });
});

describe("buildFeedbackHandoffMarkdown", () => {
  const sensitiveFixture = {
    sourceType: "FEEDBACK_TICKET",
    id: "ticket_demo_42",
    tenantId: "org_demo_winery",
    status: "TRIAGED",
    automationStatus: "PLANNED",
    triageClass: "PRODUCT_GAP",
    title: "Cellar [sync] breaks",
    body: "Inventory *drops* after the second sync.",
    kind: "BUG_REPORT",
    severity: "P1",
    planTitle: "Reconcile [inventory] safely",
    githubIssueUrl: "https://github.com/acme/wine/issues/42?private=ignored#comment",
    prUrl: null,
    linearIssueUrl: null,
    automationConflict: null,
    actorEmail: "private-person@example.test",
    actorUserId: "usr_private_123",
    userAgent: "SECRET_USER_AGENT",
    pageUrl: "https://winery.test/cellar?signed=PAGE_SECRET",
    debugContext: { databaseUrl: "DEBUG_SECRET" },
    conversation: [{ role: "user", content: "PRIVATE_TRANSCRIPT" }],
    attachments: [{ filename: "PRIVATE_FILENAME.png", url: "https://blob.test/SIGNED_BLOB_SECRET" }],
    developerNotes: "PRIVATE_DEVELOPER_HISTORY",
    planMarkdown: "PRIVATE_RAW_PLAN_MARKDOWN",
  } satisfies FeedbackHandoffItem & Record<string, unknown>;

  it("produces the stable, bounded engineering handoff golden", () => {
    expect(buildFeedbackHandoffMarkdown(sensitiveFixture, "https://wine.example.test/config?ignored=1"))
      .toMatchInlineSnapshot(`
        "# Cellar \\[sync\\] breaks

        ## Source

        - Type: FEEDBACK_TICKET

        - ID: ticket_demo_42

        - Wine Inventory: [Open private source item](https://wine.example.test/developer?tenantId=org_demo_winery&source=FEEDBACK_TICKET&item=ticket_demo_42)

        - Kind: BUG\\_REPORT

        - Severity: P1

        - Disposition: PRODUCT\\_GAP

        ## Problem statement

        > Inventory \\*drops\\* after the second sync.

        ## Generated work

        - Automation state: PLANNED

        - Plan title: Reconcile \\[inventory\\] safely

        - GitHub: [Open generated work](https://github.com/acme/wine/issues/42)

        ## Reproduction / evidence

        - [ ] Confirm the smallest reproducible case in Wine Inventory.

        - [ ] Record any non-private reproduction notes here.

        ## Acceptance criteria

        - [ ] Define the expected behavior and verification steps.

        > Private evidence remains in Wine Inventory; open the source item in developer support context.

        > Review this bounded packet for secrets or personal data before pasting it into Linear."
      `);
  });

  it("never copies identity, debug, reporter URLs, attachments, history, or raw plan Markdown", () => {
    const packet = buildFeedbackHandoffMarkdown(sensitiveFixture, "https://wine.example.test");
    for (const forbidden of [
      "private-person@example.test",
      "usr_private_123",
      "SECRET_USER_AGENT",
      "PAGE_SECRET",
      "DEBUG_SECRET",
      "PRIVATE_TRANSCRIPT",
      "PRIVATE_FILENAME.png",
      "SIGNED_BLOB_SECRET",
      "PRIVATE_DEVELOPER_HISTORY",
      "PRIVATE_RAW_PLAN_MARKDOWN",
    ]) {
      expect(packet).not.toContain(forbidden);
    }
  });

  it("bounds every user-controlled copied field", () => {
    const packet = buildFeedbackHandoffMarkdown(
      {
        ...sensitiveFixture,
        title: `${"t".repeat(200)}TITLE_SENTINEL`,
        body: `${"b".repeat(1400)}BODY_SENTINEL`,
        kind: `${"k".repeat(80)}KIND_SENTINEL`,
        severity: `${"s".repeat(40)}SEVERITY_SENTINEL`,
        triageClass: `${"d".repeat(80)}DISPOSITION_SENTINEL`,
        planTitle: `${"p".repeat(200)}PLAN_SENTINEL`,
      },
      "https://wine.example.test",
    );
    expect(packet).not.toMatch(/TITLE_SENTINEL|BODY_SENTINEL|KIND_SENTINEL|SEVERITY_SENTINEL|DISPOSITION_SENTINEL|PLAN_SENTINEL/);
  });

  it("omits lookalike/private artifact URLs and never derives the deep-link origin from report data", () => {
    const unsafePageFixture = {
      ...sensitiveFixture,
      githubIssueUrl: "https://github.com.evil.test/acme/wine/issues/42?token=PRIVATE",
      pageUrl: "https://attacker.test/developer?supportToken=SECRET",
    };
    const packet = buildFeedbackHandoffMarkdown(
      unsafePageFixture,
      "http://localhost:3000",
    );
    expect(packet).toContain("http://localhost:3000/developer?tenantId=org_demo_winery");
    expect(packet).not.toContain("github.com.evil.test");
    expect(packet).not.toContain("attacker.test");
    expect(packet).not.toContain("supportToken");
  });

  it("falls through an unsafe GitHub candidate to a later allowlisted work URL", () => {
    const packet = buildFeedbackHandoffMarkdown(
      {
        ...sensitiveFixture,
        githubIssueUrl: "https://github.com.evil.test/acme/wine/issues/42?token=PRIVATE",
        githubRunUrl: null,
        prUrl: "https://github.com/acme/wine/pull/43?private=ignored",
      },
      "https://wine.example.test",
    );
    expect(packet).toContain("https://github.com/acme/wine/pull/43");
    expect(packet).not.toContain("github.com.evil.test");
    expect(packet).not.toContain("private=ignored");
  });
});
