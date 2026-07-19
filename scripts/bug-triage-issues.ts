/**
 * Read-only, cross-tenant plan-issue ↔ feedback-ticket resolver for the /bug-triage ISSUE SWEEP.
 *
 * The feedback→plan automation opens a GitHub issue ("feedback: plan …") for a PLAN-mode run and
 * stamps its URL onto the source feedback item's `githubIssueUrl`. Those issues pile up open even
 * after the ticket resolves — but the issue's own title/body carries only the PLAN-RUN id (and an
 * 8-char truncated source id), NOT the feedback ticket id, so you CANNOT map the issue back to its
 * ticket from GitHub alone (see: the sweep proved `triage:lookup` returns `missing` for those cuids).
 * The authoritative mapping lives HERE, in the DB: the `githubIssueUrl` column on the two feedback
 * models. This script inverts it — for every feedback item that has a plan issue, it returns
 * { issueNumber → ticket status }, uncapped and cross-tenant (owner connection, BYPASSRLS), so the
 * sweep can auto-close a plan issue whose ticket is provably closed (RESOLVED/DISMISSED or fix PR
 * merged) and leave the rest. NO writes.
 *
 * Contrast with `triage:lookup` (resolves a feedback id → status) and `triage:list` (the capped,
 * 8-items/tenant intake window). This is the uncapped forward map ticket→issue, inverted.
 *
 * Run (from a checkout that has .env):
 *   npm run triage:issues
 *   # or: tsx --conditions=react-server --env-file=.env scripts/bug-triage-issues.ts
 *
 * Prints { contractVersion, planIssues: [{ issueNumber, issueUrl, ticketId, tenantId, sourceType,
 * status, automationStatus, prNumber, prUrl, title, isOpen, prMerged }] }. `isOpen` is the ticket's
 * open-state (NEW|TRIAGED|IN_PROGRESS); `prMerged` is unknown here (the sweep resolves PR state via
 * gh) and is always null — prNumber is provided so the sweep can check it. Only items whose
 * `githubIssueUrl` points at a real `/issues/<n>` are returned.
 */
import { runAsSystem, disconnectSystem } from "../src/lib/tenant/system";

// A ticket is still "open" (its plan issue must stay open) in exactly these states; anything else
// (RESOLVED | DISMISSED) means the work is done and the plan issue is stale → closeable.
const OPEN_STATUSES = new Set(["NEW", "TRIAGED", "IN_PROGRESS"]);

const issueNumberOf = (url: string | null): number | null => {
  const m = (url || "").match(/\/issues\/(\d+)/);
  return m ? Number(m[1]) : null;
};
const prNumberOf = (prUrl: string | null): number | null => {
  const m = (prUrl || "").match(/\/pull\/(\d+)/);
  return m ? Number(m[1]) : null;
};

async function main() {
  const rows = await runAsSystem(async (db) => {
    // Owner connection carries BYPASSRLS, so this reads across every tenant in one query, uncapped.
    const [tickets, assistant] = await Promise.all([
      db.feedbackTicket.findMany({
        where: { githubIssueUrl: { not: null } },
        select: { id: true, tenantId: true, title: true, status: true, automationStatus: true, githubIssueUrl: true, prUrl: true },
      }),
      db.assistantFeedback.findMany({
        where: { githubIssueUrl: { not: null } },
        select: { id: true, tenantId: true, comment: true, status: true, automationStatus: true, githubIssueUrl: true, prUrl: true },
      }),
    ]);
    return [
      ...tickets.map((t) => ({
        issueNumber: issueNumberOf(t.githubIssueUrl),
        issueUrl: t.githubIssueUrl,
        ticketId: t.id,
        tenantId: t.tenantId,
        sourceType: "FEEDBACK_TICKET" as const,
        status: t.status,
        automationStatus: t.automationStatus,
        prNumber: prNumberOf(t.prUrl ?? null),
        prUrl: t.prUrl ?? null,
        title: t.title,
        isOpen: OPEN_STATUSES.has(t.status),
        prMerged: null as boolean | null,
      })),
      ...assistant.map((a) => ({
        issueNumber: issueNumberOf(a.githubIssueUrl),
        issueUrl: a.githubIssueUrl,
        ticketId: a.id,
        tenantId: a.tenantId,
        sourceType: "ASSISTANT_FEEDBACK" as const,
        status: a.status,
        automationStatus: a.automationStatus,
        prNumber: prNumberOf(a.prUrl ?? null),
        prUrl: a.prUrl ?? null,
        title: (a.comment || "Assistant thumbs-down").slice(0, 80),
        isOpen: OPEN_STATUSES.has(a.status),
        prMerged: null as boolean | null,
      })),
    ];
  });

  // Keep only rows whose githubIssueUrl actually resolved to an /issues/<n>.
  const planIssues = rows.filter((r) => r.issueNumber !== null);

  console.log(JSON.stringify({ contractVersion: 1, planIssues }, null, 2));
  await disconnectSystem();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
