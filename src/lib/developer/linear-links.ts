import type { Prisma } from "@prisma/client";
import { sanitizePlainText } from "@/lib/feedback/sanitize";

export const DEVELOPER_QUEUES = ["INBOX", "READY", "TRACKED", "CLOSED"] as const;

export type DeveloperQueue = (typeof DEVELOPER_QUEUES)[number];
export type DeveloperFeedbackSource = "ASSISTANT_FEEDBACK" | "FEEDBACK_TICKET";

const CLOSED_STATUSES = ["RESOLVED", "DISMISSED"] as const;
const KNOWN_SOURCE_STATUSES = ["NEW", "TRIAGED", "IN_PROGRESS", ...CLOSED_STATUSES] as const;
const ACTIONABLE_TRIAGE_CLASSES = ["DEFECT", "MODEL_BEHAVIOR", "PRODUCT_GAP"] as const;
const TRACKED_AUTOMATION_STATUSES = ["PLANNED", "PR_OPENED"] as const;

export type DeveloperQueueItem = {
  sourceType: DeveloperFeedbackSource;
  id: string;
  status: string;
  automationStatus: string;
  triageClass: string | null;
  linearIssueUrl?: string | null;
  linearLink?: { linearIssueUrl?: string | null } | null;
  linearLinks?: readonly unknown[];
  prUrl?: string | null;
  githubIssueUrl?: string | null;
  automationConflict?: unknown | null;
};

export type LinearIssueUrlParseResult =
  | { ok: true; linearIssueKey: string; normalizedUrl: string }
  | {
      ok: false;
      error: {
        code:
          | "EMPTY"
          | "INVALID_URL"
          | "INVALID_PROTOCOL"
          | "INVALID_HOST"
          | "CREDENTIALS_NOT_ALLOWED"
          | "PORT_NOT_ALLOWED"
          | "INVALID_ISSUE_PATH";
        message: string;
      };
    };

function parseError(
  code: Extract<LinearIssueUrlParseResult, { ok: false }>["error"]["code"],
  message: string,
): LinearIssueUrlParseResult {
  return { ok: false, error: { code, message } };
}

/** Strictly parse the one external URL shape accepted by the manual Linear handoff. */
export function parseLinearIssueUrl(value: string): LinearIssueUrlParseResult {
  const candidate = value.trim();
  if (!candidate) return parseError("EMPTY", "Enter a Linear issue URL.");
  if (candidate.includes("\\")) {
    return parseError("INVALID_URL", "Enter an absolute Linear issue URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return parseError("INVALID_URL", "Enter an absolute Linear issue URL.");
  }

  if (parsed.protocol !== "https:") {
    return parseError("INVALID_PROTOCOL", "Linear issue URLs must use HTTPS.");
  }

  const authority = candidate.match(/^https:\/\/([^/?#]+)/i)?.[1];
  if (!authority) return parseError("INVALID_URL", "Enter an absolute Linear issue URL.");
  if (authority.includes("@") || parsed.username || parsed.password) {
    return parseError("CREDENTIALS_NOT_ALLOWED", "Linear issue URLs cannot contain credentials.");
  }
  if (/^linear\.app:/i.test(authority) || parsed.port) {
    return parseError("PORT_NOT_ALLOWED", "Linear issue URLs cannot specify a port.");
  }
  if (authority.toLowerCase() !== "linear.app" || parsed.hostname.toLowerCase() !== "linear.app") {
    return parseError("INVALID_HOST", "The URL host must be exactly linear.app.");
  }

  const path = parsed.pathname.match(
    /^\/([A-Za-z0-9][A-Za-z0-9_-]{0,79})\/issue\/([A-Za-z][A-Za-z0-9]{0,15}-[1-9][0-9]{0,11})(?:\/([A-Za-z0-9][A-Za-z0-9._~-]{0,199}))?\/?$/,
  );
  if (!path) {
    return parseError(
      "INVALID_ISSUE_PATH",
      "Use an exact https://linear.app/<workspace>/issue/<KEY>/... issue URL.",
    );
  }

  const [, workspace, rawIssueKey, slug] = path;
  const linearIssueKey = rawIssueKey.toUpperCase();
  const normalizedUrl = `https://linear.app/${workspace}/issue/${linearIssueKey}${slug ? `/${slug}` : ""}`;
  return { ok: true, linearIssueKey, normalizedUrl };
}

function isClosed(item: DeveloperQueueItem): boolean {
  return (CLOSED_STATUSES as readonly string[]).includes(item.status);
}

function hasUnknownLegacyStatus(item: DeveloperQueueItem): boolean {
  return (
    item.sourceType === "ASSISTANT_FEEDBACK" &&
    !(KNOWN_SOURCE_STATUSES as readonly string[]).includes(item.status)
  );
}

function isActionable(item: DeveloperQueueItem): boolean {
  return (ACTIONABLE_TRIAGE_CLASSES as readonly string[]).includes(item.triageClass ?? "");
}

function hasTrackedWork(item: DeveloperQueueItem): boolean {
  return Boolean(
    item.linearIssueUrl ||
      item.linearLink?.linearIssueUrl ||
      item.linearLinks?.length ||
      item.prUrl ||
      item.githubIssueUrl ||
      (TRACKED_AUTOMATION_STATUSES as readonly string[]).includes(item.automationStatus),
  );
}

export function developerQueueDiagnostic(item: DeveloperQueueItem): string | null {
  if (!hasUnknownLegacyStatus(item)) return null;
  const status = sanitizePlainText(item.status, 80).trim() || "(empty)";
  return `Unknown legacy AssistantFeedback status "${status}"; review it before promotion.`;
}

/** Apply queue precedence once for UI, actions, and query-parity fixtures. */
export function deriveDeveloperQueue(item: DeveloperQueueItem): DeveloperQueue {
  if (isClosed(item)) return "CLOSED";
  if (item.automationStatus === "FAILED" || item.automationConflict || hasUnknownLegacyStatus(item)) {
    return "INBOX";
  }
  if (hasTrackedWork(item)) return "TRACKED";
  if (item.status === "NEW" || !item.triageClass || item.triageClass === "UNCLEAR") return "INBOX";
  if (isActionable(item)) return "READY";
  return "INBOX";
}

type QueueWhere = Record<string, unknown>;

function queueWhere(
  sourceType: DeveloperFeedbackSource,
  queue: DeveloperQueue,
): QueueWhere {
  const closed: QueueWhere = { status: { in: [...CLOSED_STATUSES] } };
  const attention: QueueWhere = {
    OR: [
      { automationStatus: "FAILED" },
      {
        AND: [
          { triageClass: "PRODUCT_GAP" },
          {
            automationRuns: {
              some: {
                kind: "AGENTIC_FIX",
                status: { in: ["QUEUED", "RUNNING", "PR_OPENED"] },
              },
            },
          },
        ],
      },
    ],
  };
  const tracked: QueueWhere = {
    OR: [
      { linearLinks: { some: {} } },
      { AND: [{ prUrl: { not: null } }, { prUrl: { not: "" } }] },
      {
        AND: [
          { githubIssueUrl: { not: null } },
          { githubIssueUrl: { not: "" } },
        ],
      },
      { automationStatus: { in: [...TRACKED_AUTOMATION_STATUSES] } },
    ],
  };
  const unknownLegacyStatus: QueueWhere | null =
    sourceType === "ASSISTANT_FEEDBACK"
      ? { status: { notIn: [...KNOWN_SOURCE_STATUSES] } }
      : null;
  const knownLegacyStatus: QueueWhere | null =
    sourceType === "ASSISTANT_FEEDBACK"
      ? { status: { in: [...KNOWN_SOURCE_STATUSES] } }
      : null;
  const needsDisposition: QueueWhere = {
    OR: [
      { status: "NEW" },
      { triageClass: null },
      { triageClass: { in: ["UNCLEAR", "NOT_A_BUG"] } },
    ],
  };

  switch (queue) {
    case "CLOSED":
      return closed;
    case "INBOX":
      return {
        AND: [
          { NOT: closed },
          {
            OR: [
              attention,
              ...(unknownLegacyStatus ? [unknownLegacyStatus] : []),
              { AND: [{ NOT: tracked }, needsDisposition] },
            ],
          },
        ],
      };
    case "TRACKED":
      return {
        AND: [
          { NOT: closed },
          { NOT: attention },
          ...(knownLegacyStatus ? [knownLegacyStatus] : []),
          tracked,
        ],
      };
    case "READY":
      return {
        AND: [
          { NOT: closed },
          { NOT: attention },
          ...(knownLegacyStatus ? [knownLegacyStatus] : []),
          { NOT: tracked },
          { status: { not: "NEW" } },
          { triageClass: { in: [...ACTIONABLE_TRIAGE_CLASSES] } },
        ],
      };
  }
}

export function buildDeveloperQueueWhere(
  sourceType: "ASSISTANT_FEEDBACK",
  queue: DeveloperQueue,
): Prisma.AssistantFeedbackWhereInput;
export function buildDeveloperQueueWhere(
  sourceType: "FEEDBACK_TICKET",
  queue: DeveloperQueue,
): Prisma.FeedbackTicketWhereInput;
export function buildDeveloperQueueWhere(
  sourceType: DeveloperFeedbackSource,
  queue: DeveloperQueue,
): Prisma.AssistantFeedbackWhereInput | Prisma.FeedbackTicketWhereInput;
export function buildDeveloperQueueWhere(
  sourceType: DeveloperFeedbackSource,
  queue: DeveloperQueue,
): Prisma.AssistantFeedbackWhereInput | Prisma.FeedbackTicketWhereInput {
  return queueWhere(sourceType, queue) as
    | Prisma.AssistantFeedbackWhereInput
    | Prisma.FeedbackTicketWhereInput;
}

export type PromotionEligibility = { allowed: true; reason: null } | { allowed: false; reason: string };

export function promotionEligibility(item: DeveloperQueueItem): PromotionEligibility {
  const diagnostic = developerQueueDiagnostic(item);
  if (diagnostic) return { allowed: false, reason: diagnostic };
  if (isClosed(item)) return { allowed: false, reason: "Reopen this item before promoting it." };
  if (!item.triageClass) return { allowed: false, reason: "Classify this item before promoting it." };
  if (item.triageClass === "NOT_A_BUG") {
    return { allowed: false, reason: "Reclassify this item before promoting it; it is marked Not a bug." };
  }
  if (item.triageClass === "UNCLEAR") {
    return { allowed: false, reason: "Investigate and reclassify this item before promoting it." };
  }
  if (isActionable(item)) return { allowed: true, reason: null };
  return { allowed: false, reason: "Use an actionable disposition before promoting this item." };
}

export type FeedbackHandoffItem = DeveloperQueueItem & {
  tenantId: string;
  title?: string | null;
  body?: string | null;
  comment?: string | null;
  kind?: string | null;
  severity?: string | null;
  planTitle?: string | null;
  planGeneratedAt?: string | Date | null;
  githubRunUrl?: string | null;
};

function boundedMarkdown(value: string | null | undefined, max: number): string {
  return sanitizePlainText(value, max)
    .replace(/\r\n?/g, "\n")
    .replace(/([\\`*_[\]<>#])/g, "\\$1")
    .slice(0, max)
    .trim();
}

function boundedOpaqueId(value: string): string {
  return sanitizePlainText(value, 160).replace(/[`\r\n]/g, "").trim();
}

function trustedDeveloperLink(item: FeedbackHandoffItem, trustedAppBaseUrl: string): string {
  let base: URL;
  try {
    base = new URL(trustedAppBaseUrl);
  } catch {
    throw new Error("BETTER_AUTH_URL must be an absolute HTTP(S) URL.");
  }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new Error("BETTER_AUTH_URL must be an absolute HTTP(S) URL without credentials.");
  }
  const link = new URL("/developer", base.origin);
  link.searchParams.set("tenantId", boundedOpaqueId(item.tenantId));
  link.searchParams.set("source", item.sourceType);
  link.searchParams.set("item", boundedOpaqueId(item.id));
  return link.toString();
}

function safeGitHubUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "github.com" ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Build the bounded packet copied by a developer; no raw evidence or history is accepted. */
export function buildFeedbackHandoffMarkdown(
  item: FeedbackHandoffItem,
  trustedAppBaseUrl: string,
): string {
  const title = boundedMarkdown(
    item.title || (item.sourceType === "ASSISTANT_FEEDBACK" ? "Assistant thumbs-down" : "Feedback item"),
    160,
  );
  const problem = boundedMarkdown(item.body ?? item.comment ?? "No problem statement supplied.", 1200);
  const kind = boundedMarkdown(item.kind || (item.sourceType === "ASSISTANT_FEEDBACK" ? "Assistant" : "Ticket"), 60);
  const severity = boundedMarkdown(item.severity || "Not set", 20);
  const disposition = boundedMarkdown(item.triageClass || "Untriaged", 40);
  const developerLink = trustedDeveloperLink(item, trustedAppBaseUrl);
  const githubUrl =
    [item.githubIssueUrl, item.githubRunUrl, item.prUrl]
      .map(safeGitHubUrl)
      .find((value): value is string => value !== null) ?? null;
  const hasGeneratedPlan = Boolean(
    item.planTitle ||
      item.planGeneratedAt ||
      githubUrl ||
      (TRACKED_AUTOMATION_STATUSES as readonly string[]).includes(item.automationStatus),
  );
  const problemQuote = (problem || "No problem statement supplied.")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  const sections = [
    `# ${title}`,
    "## Source",
    `- Type: ${item.sourceType}`,
    `- ID: ${boundedOpaqueId(item.id)}`,
    `- Wine Inventory: [Open private source item](${developerLink})`,
    `- Kind: ${kind}`,
    `- Severity: ${severity}`,
    `- Disposition: ${disposition}`,
    "## Problem statement",
    problemQuote,
  ];

  if (hasGeneratedPlan) {
    sections.push(
      "## Generated work",
      `- Automation state: ${boundedMarkdown(item.automationStatus, 40) || "Not requested"}`,
    );
    if (item.planTitle) sections.push(`- Plan title: ${boundedMarkdown(item.planTitle, 160)}`);
    if (githubUrl) sections.push(`- GitHub: [Open generated work](${githubUrl})`);
  }

  sections.push(
    "## Reproduction / evidence",
    "- [ ] Confirm the smallest reproducible case in Wine Inventory.",
    "- [ ] Record any non-private reproduction notes here.",
    "## Acceptance criteria",
    "- [ ] Define the expected behavior and verification steps.",
    "> Private evidence remains in Wine Inventory; open the source item in developer support context.",
    "> Review this bounded packet for secrets or personal data before pasting it into Linear.",
  );

  return sections.join("\n\n");
}
