import "server-only";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit, diff } from "@/lib/audit";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { getEntity, allowedEntityNames } from "../entities";
import { validateFields } from "../fields";

type DbCreateInput = { entity?: string; values?: Record<string, unknown> };

function assertScoped(entity: { vineyardScoped: boolean }, user: { role: string | null; vineyardIds: string[] }, data: Record<string, unknown>) {
  if (entity.vineyardScoped) {
    if (user.role !== "admin") {
      const vid = (data as { vineyardId?: string }).vineyardId;
      if (!vid || !user.vineyardIds.includes(vid)) {
        throw new Error("You can only create records in your assigned vineyard.");
      }
    }
  } else if (user.role !== "admin") {
    throw new Error("Only an admin can create global records.");
  }
}

export const dbCreateTool: AssistantTool = {
  name: "db_create",
  description:
    "Create a new record. Provide the entity and a `values` object (field name -> value). Reference parents (e.g. vineyard, variety) by name; they're resolved for you. Returns a preview the user must confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      entity: { type: "string", description: "Entity type, e.g. 'VineyardBlock'." },
      values: { type: "object", description: "Field names mapped to values.", additionalProperties: true },
    },
    required: ["entity", "values"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as DbCreateInput;
    const entity = getEntity(input.entity ?? "");
    if (!entity || !entity.creatable || !entity.buildCreate || !entity.create) {
      throw new Error(`Cannot create "${input.entity ?? ""}". Creatable entities: ${allowedEntityNames().join(", ")}.`);
    }
    const values = validateFields(entity.creatable, input.values ?? {}, "create");
    const { data, label } = await entity.buildCreate(ctx.user, values);
    assertScoped(entity, ctx.user, data);

    const preview = `Create ${entity.displayName} "${label}".`;
    const token = signProposal("db_create", { entity: entity.name, data, label });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitDbCreate: Committer = async (user, args) => {
  const entity = getEntity(String(args.entity ?? ""));
  if (!entity || !entity.create) throw new Error("That record can no longer be created.");
  const data = (args.data ?? {}) as Record<string, unknown>;
  const label = String(args.label ?? "");
  assertScoped(entity, user, data);

  let newId = "";
  await runInTenantTx(async (tx) => {
    newId = await entity.create!(tx, data);
    await writeAudit(tx, {
      actorUserId: user.id,
      actorEmail: user.email,
      action: "CREATE",
      entityType: entity.name,
      entityId: newId,
      changes: diff(null, data),
      summary: `Created ${entity.displayName} ${label}`,
    });
  });
  return { message: `Created ${entity.displayName} "${label}".` };
};
