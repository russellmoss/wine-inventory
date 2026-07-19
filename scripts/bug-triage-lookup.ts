/**
 * Read-only, cross-tenant feedback-item lookup by id for the /bug-triage sweep.
 *
 * `triage:list` is capped (20 tenants, 8 items/tenant), so a fix PR whose source
 * ticket has aged out of that window is invisible to intake — and a merged fix can't
 * be reconciled if its ticket never surfaced. The PR sweep extracts a `linkedFeedbackId`
 * from a fix PR's body/branch (e.g. `feedback-bug/<id>`); this script resolves those ids
 * DIRECTLY from the DB (owner connection, NO cap, both feedback models) so the sweep can
 * write the ticket back to RESOLVED after it merges the PR. NO writes.
 *
 * Run (from a checkout that has .env):
 *   npm run triage:lookup -- --ids=<id1,id2,...>
 *   # or: tsx --conditions=react-server --env-file=.env scripts/bug-triage-lookup.ts --ids=a,b
 *
 * Prints { contractVersion, found: [{ id, tenantId, sourceType, status, automationStatus,
 * prUrl, prNumber, title, isOpen }], missing: [ids] }. An id is looked up in BOTH
 * feedback_ticket and assistant_feedback (cuids are globally unique).
 */
import { runAsSystem, disconnectSystem } from "../src/lib/tenant/system";

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const OPEN_STATUSES = new Set(["NEW", "TRIAGED", "IN_PROGRESS"]);
const prNumberOf = (prUrl: string | null): number | null => {
  const m = (prUrl || "").match(/\/pull\/(\d+)/);
  return m ? Number(m[1]) : null;
};

async function main() {
  const ids = (arg("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    console.error("Usage: --ids=<id1,id2,...>");
    process.exit(1);
  }

  const found = await runAsSystem(async (db) => {
    // Owner connection carries BYPASSRLS, so this reads across every tenant in one query.
    const [tickets, assistant] = await Promise.all([
      db.feedbackTicket.findMany({
        where: { id: { in: ids } },
        select: { id: true, tenantId: true, title: true, status: true, automationStatus: true, prUrl: true },
      }),
      db.assistantFeedback.findMany({
        where: { id: { in: ids } },
        select: { id: true, tenantId: true, status: true, automationStatus: true, prUrl: true, comment: true },
      }),
    ]);
    const rows = [
      ...tickets.map((t) => ({
        id: t.id,
        tenantId: t.tenantId,
        sourceType: "FEEDBACK_TICKET" as const,
        status: t.status,
        automationStatus: t.automationStatus,
        prUrl: t.prUrl ?? null,
        prNumber: prNumberOf(t.prUrl ?? null),
        title: t.title,
        isOpen: OPEN_STATUSES.has(t.status),
      })),
      ...assistant.map((a) => ({
        id: a.id,
        tenantId: a.tenantId,
        sourceType: "ASSISTANT_FEEDBACK" as const,
        status: a.status,
        automationStatus: a.automationStatus,
        prUrl: a.prUrl ?? null,
        prNumber: prNumberOf(a.prUrl ?? null),
        title: (a.comment || "Assistant thumbs-down").slice(0, 80),
        isOpen: OPEN_STATUSES.has(a.status),
      })),
    ];
    return rows;
  });

  const foundIds = new Set(found.map((r) => r.id));
  const missing = ids.filter((id) => !foundIds.has(id));

  console.log(JSON.stringify({ contractVersion: 1, found, missing }, null, 2));
  await disconnectSystem();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
