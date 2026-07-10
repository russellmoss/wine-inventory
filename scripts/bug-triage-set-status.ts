/**
 * Close out (or update) ONE feedback item's lifecycle status — the CLI twin of the
 * /developer console's ItemEditor (updateFeedbackItem). This is the piece that was
 * missing: nothing wrote items back to RESOLVED/DISMISSED, so bug reports lingered at
 * NEW/TRIAGED forever even after their fix PR merged.
 *
 * The /bug-triage skill calls this to close the loop:
 *   - RESOLVED  when it auto-merges a fix (or reconciles an already-merged PR),
 *   - DISMISSED when it (or you) rejects a report as noise / not-a-bug / wontfix,
 *   - TRIAGED   when it hands an item to a human with a verdict note.
 *
 * Run (from a checkout that has .env — the main repo, not a worktree):
 *   npm run triage:resolve -- --tenant=<id> --source=<FEEDBACK_TICKET|ASSISTANT_FEEDBACK> \
 *     --id=<itemId> --status=<RESOLVED|DISMISSED|TRIAGED|IN_PROGRESS> [--note="..."] \
 *     [--approver=<userId>] [--dry-run]
 *
 * Notes:
 *   - developerNotes are PREPENDED (newest first), never clobbered, capped at 5000 chars.
 *   - ASSISTANT_FEEDBACK has no IN_PROGRESS state (mirrors updateFeedbackItem); it is ignored there.
 *   - Writes an audit row, same as a human edit in the console.
 */
import { FeedbackItemStatus } from "@prisma/client";
import { runAsTenant } from "../src/lib/tenant/context";
import { runInTenantTx } from "../src/lib/tenant/tx";
import { writeAudit } from "../src/lib/audit";
import { runAsSystem, disconnectSystem } from "../src/lib/tenant/system";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const VALID = new Set(["NEW", "TRIAGED", "IN_PROGRESS", "RESOLVED", "DISMISSED"]);

async function resolveActor(tenantId: string): Promise<{ id: string; email: string } | null> {
  const explicit = arg("approver") ?? process.env.TRIAGE_APPROVER_USER_ID;
  return runAsSystem(async (db) => {
    if (explicit) {
      const u = await db.user.findUnique({ where: { id: explicit }, select: { id: true, email: true } });
      if (u) return { id: u.id, email: u.email };
    }
    const dev = await db.user.findFirst({ where: { role: "developer" }, select: { id: true, email: true } });
    if (dev) return { id: dev.id, email: dev.email };
    const member = await db.member.findFirst({ where: { organizationId: tenantId }, select: { user: { select: { id: true, email: true } } } });
    return member?.user ? { id: member.user.id, email: member.user.email } : null;
  });
}

async function main() {
  const tenantId = arg("tenant");
  const sourceType = arg("source");
  const id = arg("id");
  const status = arg("status");
  const note = arg("note");
  const dryRun = hasFlag("dry-run");

  if (!tenantId || !id || !status || (sourceType !== "FEEDBACK_TICKET" && sourceType !== "ASSISTANT_FEEDBACK")) {
    console.error("Usage: --tenant=<id> --source=<FEEDBACK_TICKET|ASSISTANT_FEEDBACK> --id=<itemId> --status=<RESOLVED|DISMISSED|TRIAGED|IN_PROGRESS> [--note=...] [--dry-run]");
    process.exit(2);
  }
  if (!VALID.has(status)) {
    console.error(`Invalid --status. One of: ${[...VALID].join(", ")}`);
    process.exit(2);
  }

  const actor = await resolveActor(tenantId);
  if (!actor) {
    console.log(JSON.stringify({ ok: false, error: "Could not resolve an actor user id — pass --approver=<userId>." }));
    process.exit(1);
  }

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, tenantId, sourceType, id, status, note: note ?? null, actor: actor.email }, null, 2));
    return;
  }

  await runAsTenant(tenantId, () =>
    runInTenantTx(async (tx) => {
      if (sourceType === "ASSISTANT_FEEDBACK") {
        const existing = await tx.assistantFeedback.findUniqueOrThrow({ where: { id }, select: { developerNotes: true } });
        const developerNotes = mergeNotes(note, existing.developerNotes);
        await tx.assistantFeedback.update({
          where: { id },
          data: {
            // assistant feedback has no IN_PROGRESS state
            status: status !== "IN_PROGRESS" ? status : undefined,
            developerNotes,
            resolvedAt: status === "RESOLVED" ? new Date() : undefined,
            resolvedByUserId: status === "RESOLVED" ? actor.id : undefined,
          },
        });
      } else {
        const existing = await tx.feedbackTicket.findUniqueOrThrow({ where: { id }, select: { developerNotes: true } });
        const developerNotes = mergeNotes(note, existing.developerNotes);
        await tx.feedbackTicket.update({
          where: { id },
          data: {
            status: status as FeedbackItemStatus,
            developerNotes,
            resolvedAt: status === "RESOLVED" ? new Date() : undefined,
            resolvedByUserId: status === "RESOLVED" ? actor.id : undefined,
          },
        });
      }
      await writeAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        tenantId,
        action: "UPDATE",
        entityType: sourceType,
        entityId: id,
        summary: `bug-triage set status → ${status}${note ? ` (${note.slice(0, 80)})` : ""}`,
      });
    }),
  );

  console.log(JSON.stringify({ ok: true, tenantId, sourceType, id, status, actor: actor.email }, null, 2));
}

function mergeNotes(note: string | undefined, existing: string | null): string | undefined {
  if (!note) return undefined;
  const stamp = `[bug-triage ${new Date().toISOString()}] ${note}`;
  const merged = existing ? `${stamp}\n\n---\n${existing}` : stamp;
  return merged.slice(0, 5000);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSystem();
    process.exit(process.exitCode ?? 0);
  });
