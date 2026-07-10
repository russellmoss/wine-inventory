/**
 * Read-only backlog snapshot for the /bug-triage skill.
 *
 * Prints the developer feedback backlog (user bug reports + assistant
 * thumbs-down) as JSON so the triage orchestrator works from authoritative DB
 * truth instead of scraping the /developer console. This is the SAME query that
 * feeds getDeveloperFeedbackData in the UI, so what you see here is what a
 * developer sees at /developer. NO writes.
 *
 * Run (from a checkout that has .env — i.e. the main repo, not a worktree):
 *   npm run triage:list
 *   # or: tsx --conditions=react-server --env-file=.env scripts/bug-triage-list.ts
 *
 * Note: the underlying query is capped (20 tenants, 8 items/tenant) — the same
 * bound the console uses. For a deeper sweep, filter by tenant with TRIAGE_TENANT.
 */
import { getDeveloperFeedbackData } from "../src/lib/developer/feedback";

const ACTIONABLE_STATUSES = new Set(["NEW", "TRIAGED", "IN_PROGRESS"]);

async function main() {
  const tenantQuery = process.env.TRIAGE_TENANT?.trim() || undefined;
  const data = await getDeveloperFeedbackData(tenantQuery ? { tenantQuery } : {});

  const items = data.items.map((i) => ({
    sourceType: i.sourceType,
    id: i.id,
    tenantId: i.tenantId,
    tenantName: i.tenantName,
    createdAt: i.createdAt,
    kind: i.kind, // "BUG_REPORT" | "FEATURE_REQUEST" | "Assistant"
    title: i.title,
    body: i.body,
    severityReported: i.severity, // P0 | P1 | P2 | null (developer-set)
    status: i.status, // NEW | TRIAGED | IN_PROGRESS | RESOLVED | DISMISSED
    automationStatus: i.automationStatus, // NOT_REQUESTED | AWAITING_APPROVAL | QUEUED | RUNNING | PLANNED | PR_OPENED | FAILED | SKIPPED
    modeAtSubmission: i.modeAtSubmission,
    prUrl: i.prUrl,
    githubIssueUrl: i.githubIssueUrl,
    attachmentCount: i.attachmentCount, // screenshots the fix agent can see as vision
    awaitingRunId: i.awaitingRunId, // non-null => an AutomationRun is AWAITING_APPROVAL and can be dispatched
    developerNotes: i.developerNotes,
    open: ACTIONABLE_STATUSES.has(i.status),
  }));

  const actionable = items.filter((i) => i.open);
  const summary = {
    total: items.length,
    open: actionable.length,
    awaitingDispatch: items.filter((i) => i.awaitingRunId).length,
    withPr: items.filter((i) => i.prUrl).length,
    running: items.filter((i) => i.automationStatus === "RUNNING").length,
    failed: items.filter((i) => i.automationStatus === "FAILED").length,
  };

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        shownTenants: data.shownTenants,
        totalTenants: data.totalTenants,
        summary,
        items,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
