import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { getEntity, allowedEntityNames } from "../entities";
import { describeDelete, isBlocked, formatEffectGroups } from "../relations";
import { resolveExactlyOne } from "./resolve";

type DbDeleteInput = { entity?: string; query?: string; id?: string };

export const dbDeleteTool: AssistantTool = {
  name: "db_delete",
  description:
    "Delete a record (admin only). Use when the user wants to delete or remove a record. It resolves a single target by entity + query (or exact id), REFUSES if other records depend on it (and says what), and lists anything that would be cascade-deleted. This does NOT delete immediately — it returns a preview the user must confirm in the UI.",
  kind: "write",
  adminOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      entity: { type: "string", description: "Entity type, e.g. 'VineyardBlock'." },
      query: { type: "string", description: "Search text to find the row, e.g. 'Block 7 Bajo'." },
      id: { type: "string", description: "Exact row id, if known (skips the search)." },
    },
    required: ["entity"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as DbDeleteInput;
    const entity = getEntity(input.entity ?? "");
    if (!entity) {
      throw new Error(
        `Unknown or protected entity "${input.entity ?? ""}". Deletable entities: ${allowedEntityNames().join(", ")}.`,
      );
    }

    let row;
    if (input.id) {
      row = await entity.load(input.id);
      if (!row) throw new Error(`No ${entity.displayName} with that id.`);
    } else {
      const matches = await entity.find(ctx.user, input.query ?? "");
      row = resolveExactlyOne(matches, {
        describe: (m) => m.label,
        noneMsg: `No ${entity.displayName} matches "${input.query ?? ""}".`,
        manyMsg: `Several ${entity.displayName} records match`,
      });
    }

    const effects = await describeDelete(entity, row.id);
    if (isBlocked(effects)) {
      throw new Error(
        `Can't delete ${entity.displayName} "${row.label}": ${formatEffectGroups(effects.blocked)} still reference it. Delete or reassign those first.`,
      );
    }

    let preview = `Delete ${entity.displayName} "${row.label}".`;
    if (effects.cascade.length) preview += ` This also deletes: ${formatEffectGroups(effects.cascade)}.`;
    if (effects.setNull.length) preview += ` These will be unlinked: ${formatEffectGroups(effects.setNull)}.`;

    const token = signProposal("db_delete", { entity: entity.name, id: row.id, label: row.label });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitDbDelete: Committer = async (user, args) => {
  if (user.role !== "admin") throw new Error("Deleting records requires an admin.");
  const entity = getEntity(String(args.entity ?? ""));
  if (!entity) throw new Error("That entity can no longer be deleted.");
  const id = String(args.id);
  const label = String(args.label ?? id);

  // Re-validate against current state: children may have appeared since the preview.
  const effects = await describeDelete(entity, id);
  if (isBlocked(effects)) {
    throw new Error(
      `Can't delete ${entity.displayName} "${label}": ${formatEffectGroups(effects.blocked)} now reference it.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await entity.del(tx, id);
    await writeAudit(tx, {
      actorUserId: user.id,
      actorEmail: user.email,
      action: "DELETE",
      entityType: entity.name,
      entityId: id,
      summary: `Deleted ${entity.displayName} ${label}`,
    });
  });
  return { message: `Deleted ${entity.displayName} "${label}".` };
};
