import "server-only";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import type { AppUser } from "@/lib/access";

/**
 * Plan 107 Unit 1a — record that a tool was DISPATCHED, before it runs.
 *
 * Why not read `AssistantMessage.metadata.trace`: that row is written only after the whole run
 * completes, is capped at `MAX_TOOL_CALLS = 40` (trace.ts), and carries no attempted-turn
 * denominator. A zero there can never mean "unused", so it cannot support retiring a tool. A row
 * written before dispatch can.
 *
 * ⛔ PII: name and kind only. Never arguments, results, or utterance text. `sanitizeTraceValue`
 * redacts by key NAME, so anything argument-shaped can still carry a person's name — which is
 * exactly why the trace is unsafe to aggregate. The table has no column that could hold it, and
 * `test/assistant-tool-call-schema.test.ts` fails if one is added.
 *
 * BEST-EFFORT BY DESIGN. Every failure is swallowed: a logging miss is acceptable, a failed chat
 * turn is not. Same posture as `logCalculation` (src/lib/winemaking-calc/log.ts), which this
 * mirrors deliberately.
 */
export type DispatchedTool = { name: string; kind: string };

export type LogToolDispatchInput = {
  user: AppUser;
  conversationId: string | null;
  /** Which model round-trip inside the user's turn (0-based). */
  modelTurn: number;
  tools: DispatchedTool[];
};

export async function logToolDispatch(input: LogToolDispatchInput): Promise<void> {
  const { user, conversationId, modelTurn, tools } = input;
  if (tools.length === 0) return;

  // A support/developer session is scoped to the org it is VIEWING, not its own — mirrors the
  // resolution at src/app/api/assistant/route.ts. (The older calc logger reads activeOrganizationId
  // alone; here the RLS WITH CHECK would silently reject the mismatch, dropping developer rows.)
  const tenantId = user.supportOrganizationId ?? user.activeOrganizationId;
  if (!tenantId) return; // no tenant → nothing to scope the row to; skip silently

  try {
    // TENANT-3: `await` INSIDE the callback. A non-async callback returns a lazy PrismaPromise that
    // executes after the ALS context has already exited, and the write lands on the wrong tenant
    // (closed bug #531). Do not "simplify" this to `runAsTenant(tenantId, () => prisma...)`.
    await runAsTenant(tenantId, async () => {
      await prisma.assistantToolCall.createMany({
        data: tools.map((t) => ({
          tenantId, // explicit + matches the runAsTenant GUC (RLS WITH CHECK)
          userId: user.id,
          userEmail: user.email,
          conversationId,
          toolName: t.name,
          toolKind: t.kind,
          modelTurn,
        })),
      });
    });
  } catch {
    /* best-effort: a logging miss must never break the chat turn */
  }
}
