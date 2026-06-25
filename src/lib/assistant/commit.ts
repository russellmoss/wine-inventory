import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/access";
import { verifyProposal } from "./confirm";

/**
 * A committer applies a confirmed write proposal by calling the REAL server
 * action (which re-runs auth, scoping, validation, and writeAudit). Write tools
 * register their committer here in Unit 4. The args are the resolved values that
 * were signed into the proposal token.
 */
export type Committer = (user: AppUser, args: Record<string, unknown>) => Promise<{ message: string }>;

import { commitLogBrix } from "./tools/log-brix";
import { commitDeleteBrix } from "./tools/delete-brix";
import { commitSetYieldEstimate } from "./tools/set-yield-estimate";
import { commitAdjustInventory } from "./tools/adjust-inventory";
import { commitRackWine } from "./tools/rack-wine";
import { commitDbCreate } from "./tools/db-create";
import { commitDbUpdate } from "./tools/db-update";
import { commitDbDelete } from "./tools/db-delete";
import { commitSaveFieldReport } from "./tools/save-field-report";

// Static map of tool name -> committer. No side-effect registration, no import
// cycle: commit.ts imports the tool modules; the tool modules never import commit.ts.
const COMMITTERS: Record<string, Committer> = {
  log_brix: commitLogBrix,
  delete_brix: commitDeleteBrix,
  set_yield_estimate: commitSetYieldEstimate,
  adjust_inventory: commitAdjustInventory,
  rack_wine: commitRackWine,
  db_create: commitDbCreate,
  db_update: commitDbUpdate,
  db_delete: commitDbDelete,
  save_field_report: commitSaveFieldReport,
};

/**
 * Verify a confirmation token, burn its nonce (single-use, BEFORE committing so a
 * replay/double-submit can't double-apply), then run the tool's committer.
 */
export async function commitProposal(user: AppUser, token: string): Promise<{ message: string }> {
  const payload = verifyProposal(token);
  const committer = COMMITTERS[payload.tool];
  if (!committer) throw new Error("That action can no longer be applied.");

  try {
    await prisma.assistantConfirmation.create({
      data: { nonce: payload.nonce, tool: payload.tool, actorEmail: user.email },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("This change was already confirmed.");
    }
    throw e;
  }

  return committer(user, payload.args);
}
